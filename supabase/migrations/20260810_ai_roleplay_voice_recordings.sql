-- Optional learner voice recordings for AI roleplay activities.
-- Raw audio is never required: the activity_data JSON controls whether a learner
-- may save a recording, and the learner must still explicitly consent in the UI.

create table if not exists public.ai_roleplay_voice_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_roleplay_sessions(id) on delete cascade,
  activity_id uuid not null references public.lesson_slide_activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_provider text not null default 'r2',
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  duration_seconds integer not null default 0,
  transcript text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint ai_roleplay_voice_recordings_provider_check check (storage_provider in ('r2', 'supabase'))
);

create index if not exists ai_roleplay_voice_recordings_user_idx
  on public.ai_roleplay_voice_recordings(user_id, created_at desc);
create index if not exists ai_roleplay_voice_recordings_expiry_idx
  on public.ai_roleplay_voice_recordings(expires_at)
  where deleted_at is null;
create unique index if not exists ai_roleplay_voice_recordings_path_uidx
  on public.ai_roleplay_voice_recordings(storage_provider, storage_bucket, storage_path);

alter table public.ai_roleplay_voice_recordings enable row level security;

drop policy if exists "Users read own roleplay voice recordings" on public.ai_roleplay_voice_recordings;
create policy "Users read own roleplay voice recordings"
  on public.ai_roleplay_voice_recordings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users delete own roleplay voice recordings" on public.ai_roleplay_voice_recordings;
create policy "Users delete own roleplay voice recordings"
  on public.ai_roleplay_voice_recordings for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Recording inserts/deletes are performed server-side after validating the
-- activity settings and session owner. There is intentionally no client insert policy.
revoke insert, update on public.ai_roleplay_voice_recordings from anon, authenticated;
grant select, delete on public.ai_roleplay_voice_recordings to authenticated;
