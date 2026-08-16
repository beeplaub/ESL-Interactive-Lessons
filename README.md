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

## Google Analytics 4

BrenUp includes an optional GA4 integration. It is disabled unless a Measurement ID is present. Create a GA4 Web data stream for `https://www.brenup.com`, copy its Measurement ID in the form `G-XXXXXXXXXX`, and add it as:

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Add the variable in both local `.env.local` and the Vercel Production/Preview environments, then redeploy. The integration tracks learner-facing route views and intentionally skips `/admin` pages. Do not send email addresses, quiz answers, lesson text, or other personal information as analytics parameters. Configure Google Analytics data retention, consent, and deletion settings to match BrenUp's privacy obligations before public launch.

## Production email with Brevo

BrenUp keeps Supabase Auth as the identity system. Brevo is the delivery service for confirmation emails, password resets, magic links, invitations, and future transactional notifications.

1. In Brevo, verify the BrenUp sending domain and complete the SPF/DKIM records. Add a DMARC policy once mail flow is verified.
2. Create separate sender addresses when possible, for example `no-reply@auth.brenup.com` for authentication and `updates@notify.brenup.com` for product notifications.
3. In Supabase, open **Authentication > SMTP Settings** and configure Brevo's SMTP relay using the Brevo SMTP host, port, login, and SMTP key. Do not put the SMTP key in a `NEXT_PUBLIC_` variable or commit it to the repository.
4. Set the sender name to `BrenUp` and the sender address to the verified authentication sender.
5. Keep Supabase email confirmations enabled for new accounts unless there is a deliberate product reason to disable them. The login page supports password login, password reset, and passwordless email sign-in links.
6. Test confirmation, password reset, magic link, invitation, expired-link, duplicate-account, bounce, and spam-folder behavior with real addresses.

Brevo's Free plan currently provides 300 email sends per day. That is suitable for an early-stage authentication and notification volume, but the application should treat provider limits and delivery failures as normal states rather than assuming every message is delivered.

For production, keep authentication mail and marketing mail separated by sender/domain reputation. Add a backup provider before a large launch or enrollment campaign.

## Notification Center and Firebase Cloud Messaging

Run `supabase/migrations/20260816_notification_center.sql` before deploying the Notification Center. It preserves the existing in-app inbox while adding targeted campaigns, delivery logs, optional email, preferences, schedules, templates, and push-device records.

The Notification Center works with in-app delivery immediately. Optional channels require these server-only Vercel variables:

```bash
# Brevo transactional notification delivery
BREVO_API_KEY=
BREVO_NOTIFICATION_SENDER_EMAIL=updates@brenup.com
BREVO_NOTIFICATION_SENDER_NAME=BrenUp

# Firebase Admin SDK: server-only; use a Firebase service account
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

And these public Firebase Web App configuration values, plus a Firebase Web Push certificate/VAPID key:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

Use a dedicated Firebase project or a clearly named BrenUp web app. Enable **Cloud Messaging**, create a Web Push certificate, and add all variables to Vercel Production and Preview. Never expose the Firebase service-account private key. `CRON_SECRET` is also required for scheduled notification dispatch; use the same secret already used by BrenUp's cleanup cron routes. On Vercel Hobby, the notification cron runs daily at 08:00 Bangladesh time; immediate campaigns and event notifications remain immediate.

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
### AI speaking recordings

AI roleplay activities can optionally use Gemini Live voice conversation. Recording storage is off by default. A creator must enable it, and the learner must explicitly consent before the browser uploads the recording to R2. Stored recordings use a private, expiring R2 URL and are automatically cleaned up by the Vercel cron route.

Run `supabase/migrations/20260810_ai_roleplay_voice_recordings.sql` in the Supabase SQL editor before enabling saved recordings. Set `CRON_SECRET` in Vercel so the cleanup route can run, and keep `GEMINI_LIVE_MODEL` set to a model currently enabled for the Google project. If `MEDIA_STORAGE_PROVIDER=r2` is not active, saved voice recordings are refused rather than silently falling back to public storage.

### AI efficiency foundation

Run `supabase/migrations/20260813_ai_efficiency_foundation.sql` before deploying the matching application code. It adds server-only exact-response caching, duplicate-generation locks, weighted daily credits, and generation telemetry. Cached responses consume no AI credits. The cache key includes the prompt, rubric/schema, model, CEFR context, and prompt version, so content or grading changes invalidate old results automatically.

Use `AI_DAILY_LEARNER_CREDITS` and `AI_DAILY_CREATOR_CREDITS` to change daily weighted allowances. The defaults are 30 learner credits and 100 creator credits. Voice and live translation usage is accounted for in 30-second units; saved narration translations and saved voiceovers are reused instead of regenerated.
