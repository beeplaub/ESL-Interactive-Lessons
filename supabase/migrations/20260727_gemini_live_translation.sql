-- BrenUp Gemini Live translation controls and learner usage evidence.
-- Run this migration in the Supabase SQL editor before deploying the UI.

alter table public.lesson_audio_files
  add column if not exists translation_enabled boolean not null default false,
  add column if not exists narration_language text not null default 'en';

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_narration_language_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_narration_language_check
  check (narration_language in ('en', 'bn'));

create table if not exists public.live_translation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  lesson_slide_activity_id uuid references public.lesson_slide_activities(id) on delete cascade,
  narration_audio_file_id uuid references public.lesson_audio_files(id) on delete cascade,
  usage_kind text not null check (usage_kind in ('NARRATION', 'SPEAK_TRANSLATE')),
  seconds_used integer not null default 0 check (seconds_used >= 0),
  created_at timestamptz not null default now()
);

create index if not exists live_translation_usage_user_activity_created_idx
  on public.live_translation_usage (user_id, lesson_slide_activity_id, created_at desc);
create index if not exists live_translation_usage_user_narration_created_idx
  on public.live_translation_usage (user_id, narration_audio_file_id, created_at desc);

alter table public.live_translation_usage enable row level security;

drop policy if exists "Users read own live translation usage" on public.live_translation_usage;
create policy "Users read own live translation usage"
  on public.live_translation_usage for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own live translation usage" on public.live_translation_usage;
create policy "Users insert own live translation usage"
  on public.live_translation_usage for insert to authenticated
  with check (user_id = auth.uid());

-- One permanently cached output per narration and target language. The audio
-- remains in the private lesson-audio bucket and is served with short signed URLs.
create table if not exists public.narration_translation_cache (
  id uuid primary key default gen_random_uuid(),
  narration_audio_file_id uuid not null references public.lesson_audio_files(id) on delete cascade,
  target_language_code text not null check (target_language_code in ('en', 'bn')),
  storage_path text not null,
  model text not null default 'gemini-3.5-live-translate-preview',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (narration_audio_file_id, target_language_code)
);

create index if not exists narration_translation_cache_narration_idx
  on public.narration_translation_cache (narration_audio_file_id);

alter table public.narration_translation_cache enable row level security;
