-- Keep optional duration metadata alongside lesson audio for future use.
alter table public.lesson_audio_files
  add column if not exists duration_seconds numeric;

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_duration_seconds_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_duration_seconds_check
  check (duration_seconds is null or duration_seconds >= 0);

-- AI voiceovers already record their duration. Backfill narration rows that
-- point to those exact saved assets.
update public.lesson_audio_files as narration
set duration_seconds = voiceover.duration_seconds
from public.ai_voiceover_generations as voiceover
where narration.label = 'narration'
  and narration.duration_seconds is null
  and voiceover.status = 'SAVED'
  and voiceover.duration_seconds is not null
  and narration.storage_provider = voiceover.storage_provider
  and narration.storage_bucket is not distinct from voiceover.storage_bucket
  and narration.storage_path = voiceover.storage_path;
