-- Persist live-class chat and allow teachers to moderate a learner microphone
-- or revoke room membership without granting direct client table access.
alter table public.instant_live_participants
  add column mic_muted boolean not null default false;

create table public.instant_live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.instant_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index instant_live_chat_room_created_idx
  on public.instant_live_chat_messages(room_id, created_at desc);

alter table public.instant_live_chat_messages enable row level security;
revoke all on public.instant_live_chat_messages from anon, authenticated;
grant all on public.instant_live_chat_messages to service_role;
