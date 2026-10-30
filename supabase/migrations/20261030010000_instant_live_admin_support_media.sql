-- Give audited platform-admin support viewers a short-lived, receive-only
-- signaling presence so they can see an active screen share without counting
-- as a learner or gaining normal room controls.
alter table public.instant_live_participants
  drop constraint if exists instant_live_participants_role_check;

alter table public.instant_live_participants
  add constraint instant_live_participants_role_check
    check (role in ('CREATOR', 'LEARNER', 'SUPPORT'));

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
            and (
              p.role <> 'SUPPORT'
              or (
                p.last_seen_at > now() - interval '90 seconds'
                and exists (
                  select 1 from public.profiles profile
                  where profile.id = auth.uid() and profile.role = 'ADMIN'
                )
              )
            )
        )
      )
  );
$$;

revoke execute on function public.can_access_instant_room(uuid) from public, anon;
grant execute on function public.can_access_instant_room(uuid) to authenticated, service_role;
