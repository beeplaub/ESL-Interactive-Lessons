# BrenUp

A Next.js + Supabase app for turning ESL lesson PDFs and audio files into interactive learner slide decks.

## What is included

- Admin lesson upload at `/admin/lessons/new`
- PDF page extraction and rule-based slide classification
- Editable parsed slides and activities at `/admin/lessons/[id]/edit`
- Published lesson dashboard at `/dashboard`
- Interactive learner player at `/lessons/[lessonId]`
- Supabase schema, RLS policies, private storage buckets, and generated-style TypeScript DB types

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor or through the Supabase CLI.
3. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service role key is used only on the server for admin upload, parsing, and storage writes.

## Cloudflare R2 media storage

BrenUp can store creator-uploaded lesson/quiz media in Cloudflare R2 while keeping Supabase for Auth, Postgres, Realtime, and existing legacy files.

Run both migrations in the Supabase SQL editor before enabling R2 in production:

```text
supabase/migrations/20260729_r2_media_storage.sql
supabase/migrations/20260731_lesson_audio_r2_metadata.sql
```

Then add these environment variables locally and in Vercel:

```bash
MEDIA_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://media.brenup.com
```

`R2_PUBLIC_BASE_URL` should be a custom domain attached to the R2 bucket in Cloudflare. Configure these values in **both Production and Preview** on Vercel. The access key and secret must remain server-only.

### Reconcile legacy media

The migration changes metadata only; it does not copy files. Use the audited reconciler to copy BrenUp-owned legacy lesson images, audio, video, narrations, and cached narration translations into R2, rewrite their database URLs to `media.brenup.com`, index them in the Media Library, and hide exact duplicate library cards.

```bash
# Read-only inventory
node scripts/reconcile-r2-media.mjs

# Safe resumable copy batches (the originals remain in Supabase)
node scripts/reconcile-r2-media.mjs --apply --limit=50 --offset=0 --skip-index

# Historical Media Library indexing
node scripts/reconcile-r2-media.mjs --apply --index-only --limit=50 --offset=0

# Exact owner-and-URL deduplication after indexing
node scripts/reconcile-r2-media.mjs --apply --dedupe --dedupe-only --skip-index --skip-narrations
```

The script never deletes Supabase originals. Keep those rollback copies until you have independently reviewed R2 storage usage and media playback. This script intentionally leaves third-party links, including public media from other Supabase projects, as external links rather than copying content BrenUp does not own.

To probe R2 credentials, the public media domain, and deletion without touching lesson media:

```bash
node scripts/verify-r2-media.mjs
```

## Create an admin

Register normally at `/login`, then promote that user in Supabase SQL:

```sql
update public.profiles
set role = 'ADMIN'
where id = 'USER_UUID_HERE';
```

New users default to `LEARNER`.

## Google login setup

The app includes a `Continue with Google` button on `/login`, but Google must also be enabled in Supabase:

1. In Supabase, open Authentication > Providers > Google.
2. Enable Google and add your Google Client ID and Client Secret.
3. In Google Cloud Console, add this authorized redirect URL:

```text
https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
```

4. In Supabase Authentication > Settings, turn off email confirmations if you want new email/password and Google users to sign in immediately.

The OAuth callback creates a `LEARNER` profile automatically for first-time Google users. If that user is later promoted to `ADMIN`, the app reads the fresh role from the database on each protected redirect.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## First lesson

1. Sign in as an admin.
2. Go to `/admin/lessons/new`.
3. Upload the ESL lesson PDF and one or more audio files.
4. Review the parsed slides at the edit page.
5. Fix any activity JSON or audio links that need human judgment.
6. Publish the lesson.
7. Sign in as a learner and open `/dashboard`.

## Cleanup duplicate drafts

To inspect draft lessons whose title or topic contains “Beginnings”:

```bash
npm run cleanup:beginnings-drafts
```

To delete those draft lessons and their linked storage files:

```bash
npm run cleanup:beginnings-drafts -- --confirm
```

The cleanup only targets `DRAFT` lessons and does not touch published lessons.

## Parsing behavior

The parser intentionally ignores slides classified as `ANSWERS` in the learner player. It uses them to populate answer keys for the nearest previous interactive activity where possible.

The current extractor handles common Rumor-style patterns:

- word-to-definition matching
- gap fill / cloze sentences
- multiple choice
- true/false
- listening prompts
- discussions
- games
- writing and homework tasks

Rule-based parsing is conservative by design. Admins can tweak slide type, prompt, activity items, answer key JSON, linked answer slide, and linked audio before publishing.
