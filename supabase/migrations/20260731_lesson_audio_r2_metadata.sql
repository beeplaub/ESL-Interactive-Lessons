-- Store provider metadata for lesson narration and other lesson audio rows.
-- Existing Supabase-hosted rows keep working with the default values.

alter table public.lesson_audio_files
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_bucket text,
  add column if not exists public_url text;

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_storage_provider_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_storage_provider_check
  check (storage_provider in ('supabase', 'r2'));

update public.lesson_audio_files
set storage_bucket = coalesce(storage_bucket, 'lesson-audio')
where storage_bucket is null;
