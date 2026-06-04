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

## Create an admin

Register normally at `/login`, then promote that user in Supabase SQL:

```sql
update public.profiles
set role = 'ADMIN'
where id = 'USER_UUID_HERE';
```

New users default to `LEARNER`.

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
