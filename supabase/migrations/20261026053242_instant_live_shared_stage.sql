-- Saved board and an atomic, expiring presenter lease. All writes go through
-- authenticated application routes; clients never write these tables directly.
create table public.instant_live_state (
  room_id uuid primary key references public.instant_live_rooms(id) on delete cascade,
  board jsonb not null default '[]'::jsonb check (jsonb_typeof(board) = 'array'),
  board_revision integer not null default 0,
  stage text not null default 'whiteboard' check (stage in ('whiteboard','screen','camera','image')),
  asset_id uuid,
  presenter_id uuid references auth.users(id) on delete set null,
  presenter_session uuid,
  lease_until timestamptz,
  revision integer not null default 0
);
create table public.instant_live_assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.instant_live_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  bucket text not null,
  path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);
create index instant_live_assets_room_owner_idx on public.instant_live_assets(room_id,owner_id);
create index instant_live_assets_owner_idx on public.instant_live_assets(owner_id);
create index instant_live_state_presenter_idx on public.instant_live_state(presenter_id);
alter table public.instant_live_state enable row level security;
alter table public.instant_live_assets enable row level security;
revoke all on public.instant_live_state, public.instant_live_assets from anon, authenticated;
grant all on public.instant_live_state, public.instant_live_assets to service_role;
alter table public.instant_live_participants add column if not exists last_seen_at timestamptz not null default now();

-- Existing members can receive the restart event while a room is paused.
-- New members still enter through the server's LIVE-only join gate.
create or replace function public.can_access_instant_room(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.instant_live_rooms r
    where r.id = target_room_id and (
      r.creator_id = auth.uid() or (r.expires_at > now() and exists (
        select 1 from public.instant_live_participants p
        where p.room_id = r.id and p.user_id = auth.uid() and p.status = 'JOINED'
      ))
    )
  );
$$;
revoke execute on function public.can_access_instant_room(uuid) from public, anon;
grant execute on function public.can_access_instant_room(uuid) to authenticated, service_role;

-- Each member publishes on their own authorized topic. A learner cannot send
-- an event on the creator's topic or impersonate their board preview.
create policy "Instant members receive peer messages" on realtime.messages
for select to authenticated using (
  realtime.topic() ~ '^instant-peer:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  and public.can_access_instant_room(split_part(realtime.topic(), ':', 2)::uuid)
);
create policy "Instant members publish their own peer messages" on realtime.messages
for insert to authenticated with check (
  realtime.topic() ~ '^instant-peer:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  and split_part(realtime.topic(), ':', 3) = (select auth.uid())::text
  and public.can_access_instant_room(split_part(realtime.topic(), ':', 2)::uuid)
);
