create or replace function public.reorder_live_slides(p_session uuid, p_order uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.live_sessions where id=p_session and status='LIVE' for update;
  if not found then raise exception 'Class changed'; end if;
  if cardinality(p_order) <> (select count(*) from public.live_session_playlist_items where session_id=p_session)
    or cardinality(p_order) <> (select count(distinct id) from unnest(p_order) id)
    or exists(select 1 from unnest(p_order) requested(id) where not exists(select 1 from public.live_session_playlist_items p where p.id=requested.id and p.session_id=p_session)) then raise exception 'Slide list changed'; end if;
  set constraints live_slides_position_unique deferred;
  update public.live_session_playlist_items p set position=o.ordinality-1,updated_at=now() from unnest(p_order) with ordinality o(id,ordinality) where p.id=o.id and p.session_id=p_session;
  set constraints live_slides_position_unique immediate;
end;
$$;
revoke all on function public.reorder_live_slides(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_live_slides(uuid,uuid[]) to service_role;

alter table public.live_whiteboard_pages alter column document set default '{"objects":{},"settings":{"editing":false,"prompt":"","timerEnd":null,"timerSeconds":300,"view":"board","slide":1}}'::jsonb;
