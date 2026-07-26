-- Persistent session timing for the teacher command bar.
alter table public.live_sessions
  add column if not exists timer_ends_at timestamptz;

create index if not exists live_sessions_timer_idx
  on public.live_sessions(timer_ends_at)
  where timer_ends_at is not null;
