-- Persist the live duration independently from room creation time so a
-- creator can pause and restart the same temporary room without resetting it.
alter table public.instant_live_rooms
  add column if not exists elapsed_seconds integer not null default 0
    check (elapsed_seconds >= 0),
  add column if not exists active_started_at timestamptz;

-- Preserve the elapsed time of rooms that were already ended before this
-- migration, and use created_at as the active interval start for live rooms.
update public.instant_live_rooms
set elapsed_seconds = case
      when status = 'ENDED' and ended_at is not null
        then greatest(0, floor(extract(epoch from (ended_at - created_at)))::integer)
      else elapsed_seconds
    end,
    active_started_at = case
      when status = 'LIVE' then created_at
      else coalesce(ended_at, created_at)
    end
where active_started_at is null;

alter table public.instant_live_rooms
  alter column active_started_at set default now(),
  alter column active_started_at set not null;
