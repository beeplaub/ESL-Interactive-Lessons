-- A slide may use a recorded/uploaded narration or an external study-audio link.
-- Linked sources are references only: no object is stored in Supabase or R2 and
-- they are deliberately excluded from AI narration translation.

alter table public.lesson_audio_files
  alter column storage_path drop not null,
  add column if not exists source_type text not null default 'RECORDED',
  add column if not exists external_url text;

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_storage_provider_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_storage_provider_check
  check (storage_provider in ('supabase', 'r2', 'external'));

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_source_type_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_source_type_check
  check (source_type in ('RECORDED', 'UPLOADED', 'LINK'));

update public.lesson_audio_files
set source_type = 'RECORDED'
where source_type is null or source_type = '';

create index if not exists lesson_audio_files_source_type_idx
  on public.lesson_audio_files (lesson_id, slide_id, label, source_type);
