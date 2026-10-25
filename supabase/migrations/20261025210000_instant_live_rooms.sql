-- Temporary creator-started rooms. These are intentionally separate from
-- course-owned live_sessions so existing enrollment and classroom RLS remain unchanged.
create table if not exists public.instant_live_rooms (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  status text not null default 'LIVE' check (status in ('LIVE', 'ENDED')),
  max_learners integer not null default 10 check (max_learners between 1 and 10),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.instant_live_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.instant_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('CREATOR', 'LEARNER')),
  status text not null default 'JOINED' check (status in ('JOINED', 'LEFT', 'REMOVED')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (room_id, user_id)
);

create index if not exists instant_live_rooms_creator_idx on public.instant_live_rooms(creator_id, created_at desc);
create index if not exists instant_live_rooms_code_idx on public.instant_live_rooms(join_code);
create index if not exists instant_live_participants_room_idx on public.instant_live_participants(room_id, status);

alter table public.instant_live_rooms enable row level security;
alter table public.instant_live_participants enable row level security;

create or replace function public.can_access_instant_room(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.instant_live_rooms r
    where r.id = target_room_id
      and r.status = 'LIVE'
      and r.expires_at > now()
      and (r.creator_id = auth.uid() or exists (
        select 1 from public.instant_live_participants p
        where p.room_id = r.id and p.user_id = auth.uid() and p.status = 'JOINED'
      ))
  );
$$;

drop policy if exists "Instant rooms are visible to members" on public.instant_live_rooms;
create policy "Instant rooms are visible to members" on public.instant_live_rooms
  for select to authenticated using (public.can_access_instant_room(id) or creator_id = auth.uid());

drop policy if exists "Instant participants are visible to members" on public.instant_live_participants;
create policy "Instant participants are visible to members" on public.instant_live_participants
  for select to authenticated using (public.can_access_instant_room(room_id));

-- Realtime channels use the room UUID as their topic. The browser never gets
-- permission to insert or update the durable participant records directly.
drop policy if exists "Instant members receive room broadcasts" on realtime.messages;
create policy "Instant members receive room broadcasts" on realtime.messages
  for select to authenticated using (
    realtime.topic() ~ '^instant-room:[0-9a-f-]{36}$'
    and public.can_access_instant_room(split_part(realtime.topic(), ':', 2)::uuid)
  );

drop policy if exists "Instant members send room broadcasts" on realtime.messages;
create policy "Instant members send room broadcasts" on realtime.messages
  for insert to authenticated with check (
    realtime.topic() ~ '^instant-room:[0-9a-f-]{36}$'
    and public.can_access_instant_room(split_part(realtime.topic(), ':', 2)::uuid)
  );

grant select on public.instant_live_rooms, public.instant_live_participants to authenticated;
grant all on public.instant_live_rooms, public.instant_live_participants to service_role;
