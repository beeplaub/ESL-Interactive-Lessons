-- Room-level controls for Instant Live Class and an approval queue for locked rooms.
alter table public.instant_live_rooms
  add column if not exists room_locked boolean not null default false,
  add column if not exists learner_mic_enabled boolean not null default true,
  add column if not exists learner_chat_enabled boolean not null default true,
  add column if not exists learner_screen_share_enabled boolean not null default true;

alter table public.instant_live_participants
  drop constraint if exists instant_live_participants_status_check;

alter table public.instant_live_participants
  add constraint instant_live_participants_status_check
  check (status in ('JOINED', 'WAITING', 'LEFT', 'REMOVED'));

create index if not exists instant_live_participants_waiting_idx
  on public.instant_live_participants(room_id, joined_at)
  where status = 'WAITING';
