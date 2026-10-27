-- Distinguish a resumable pause from a permanently ended instant class.
alter table public.instant_live_rooms
  drop constraint if exists instant_live_rooms_status_check;

alter table public.instant_live_rooms
  add constraint instant_live_rooms_status_check
    check (status in ('LIVE', 'PAUSED', 'ENDED')),
  add column if not exists pause_until timestamptz,
  add column if not exists creator_last_seen_at timestamptz not null default now();

-- Existing rooms get a fresh creator heartbeat when this migration is applied.
update public.instant_live_rooms
set creator_last_seen_at = now()
where creator_last_seen_at is null;

-- Keep room broadcast access for already joined members during a live pause.
create or replace function public.can_access_instant_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instant_live_rooms r
    where r.id = target_room_id
      and (
        (r.status = 'LIVE' and r.expires_at > now())
        or (r.status = 'PAUSED' and r.pause_until > now())
      )
      and (
        r.creator_id = auth.uid()
        or exists (
          select 1
          from public.instant_live_participants p
          where p.room_id = r.id
            and p.user_id = auth.uid()
            and p.status = 'JOINED'
        )
      )
  );
$$;
