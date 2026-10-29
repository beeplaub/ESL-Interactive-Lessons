-- A null marker means room media cleanup is still pending. Keeping this marker
-- lets the end route retry immediately and the daily cron retry transient R2
-- or database failures without retaining successful cleanups indefinitely.
alter table public.instant_live_rooms
  add column if not exists media_cleanup_at timestamptz,
  add column if not exists media_cleanup_attempted_at timestamptz;

create index if not exists instant_live_rooms_media_cleanup_idx
  on public.instant_live_rooms (media_cleanup_attempted_at, ended_at)
  where status = 'ENDED' and media_cleanup_at is null;

create index if not exists instant_live_rooms_expired_pause_idx
  on public.instant_live_rooms (pause_until)
  where status = 'PAUSED';
