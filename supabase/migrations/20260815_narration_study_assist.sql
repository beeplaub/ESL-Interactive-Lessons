-- BrenUp narration Study Assist: creator-reviewed reading scripts and a
-- lightweight per-slide glossary. These columns live beside the narration so
-- they inherit the existing published-lesson RLS rules.

alter table public.lesson_audio_files
  add column if not exists transcript text,
  add column if not exists glossary jsonb not null default '[]'::jsonb;

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_glossary_array_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_glossary_array_check
  check (jsonb_typeof(glossary) = 'array');
