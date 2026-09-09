-- Each classroom whiteboard keeps its own document and revision history.
create table public.live_whiteboard_pages (like public.live_whiteboards including defaults including constraints);
alter table public.live_whiteboard_pages add column page_id uuid primary key references public.live_session_playlist_items(id) on delete cascade;
alter table public.live_whiteboard_pages add foreign key (session_id) references public.live_sessions(id) on delete cascade;
create index live_whiteboard_pages_session_idx on public.live_whiteboard_pages(session_id);
alter table public.live_whiteboard_pages enable row level security;
grant select on public.live_whiteboard_pages to authenticated;
grant all on public.live_whiteboard_pages to service_role;
create policy "Participants read classroom pages" on public.live_whiteboard_pages for select to authenticated using (public.can_access_live_session(session_id));
-- Preserve the legacy shared board on the first existing whiteboard slide.
insert into public.live_whiteboard_pages(session_id,page_id,document,revision,operations)
select b.session_id,p.id,b.document,b.revision,b.operations from public.live_whiteboards b
join lateral (select id from public.live_session_playlist_items where session_id=b.session_id and item_type='WHITEBOARD' order by position,id limit 1) p on true;
create function public.mutate_live_whiteboard_page(p_session uuid, p_teacher boolean, p_mutation jsonb, p_page uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare b public.live_whiteboard_pages; c jsonb; obj jsonb; expected integer; next_revision integer;
begin
  if not exists(select 1 from public.live_sessions where id=p_session and status='LIVE') then raise exception 'Class changed'; end if;
  if not exists(select 1 from public.live_session_playlist_items where id=p_page and session_id=p_session and item_type='WHITEBOARD') then raise exception 'Page changed'; end if;
  insert into public.live_whiteboard_pages(session_id,page_id) values(p_session,p_page) on conflict do nothing;
  select * into b from public.live_whiteboard_pages where session_id=p_session and page_id=p_page for update;
  if b.operations ? (p_mutation->>'operation') then return b.document || jsonb_build_object('revision', b.revision); end if;
  if not p_teacher and ((p_mutation ? 'settings') or not coalesce((b.document->'settings'->>'editing')::boolean,false)) then raise exception 'Board locked'; end if;
  if p_mutation ? 'expectedRevision' and (p_mutation->>'expectedRevision')::integer <> b.revision then raise exception 'Board changed'; end if;
  next_revision := b.revision + 1;
  for c in select value from jsonb_array_elements(coalesce(p_mutation->'changes','[]'::jsonb)) loop
    obj := b.document->'objects'->(c->>'id');
    expected := (c->>'expected')::integer;
    if (obj is null and expected is not null) or (obj is not null and ((obj->>'revision')::integer is distinct from expected)) then raise exception 'Object changed'; end if;
    if c->'value' = 'null'::jsonb then b.document := b.document #- array['objects',c->>'id'];
    else b.document := jsonb_set(b.document,array['objects',c->>'id'],(c->'value') || jsonb_build_object('revision',next_revision)); end if;
  end loop;
  if (select count(*) from jsonb_object_keys(b.document->'objects')) > 250 then raise exception 'Board full'; end if;
  if p_mutation ? 'settings' then b.document := jsonb_set(b.document,'{settings}',(b.document->'settings') || (p_mutation->'settings')); end if;
  -- Bound retry deduplication metadata; no indefinitely growing event history.
  b.operations := b.operations || jsonb_build_array(p_mutation->>'operation');
  if jsonb_array_length(b.operations)>100 then b.operations := b.operations - 0; end if;
  update public.live_whiteboard_pages set document=b.document,revision=next_revision,operations=b.operations,updated_at=now() where session_id=p_session and page_id=p_page;
  return b.document || jsonb_build_object('revision',next_revision);
end;
$$;
revoke all on function public.mutate_live_whiteboard_page(uuid,boolean,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.mutate_live_whiteboard_page(uuid,boolean,jsonb,uuid) to service_role;


-- Defer uniqueness only within the reorder transaction, never between requests.
alter table public.live_session_playlist_items add constraint live_slides_position_unique unique using index live_session_playlist_position_idx deferrable initially immediate;
create function public.reorder_live_slides(p_session uuid, p_order uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.live_sessions where id=p_session and status='LIVE' for update;
  if not found then raise exception 'Class changed'; end if;
  if cardinality(p_order) <> (select count(*) from public.live_session_playlist_items where session_id=p_session)
    or cardinality(p_order) <> (select count(distinct id) from unnest(p_order) id)
    or exists(select 1 from unnest(p_order) id where not exists(select 1 from public.live_session_playlist_items p where p.id=id and p.session_id=p_session)) then raise exception 'Slide list changed'; end if;
  set constraints live_slides_position_unique deferred;
  update public.live_session_playlist_items p set position=o.ordinality-1,updated_at=now() from unnest(p_order) with ordinality o(id,ordinality) where p.id=o.id and p.session_id=p_session;
  set constraints live_slides_position_unique immediate;
end;
$$;
revoke all on function public.reorder_live_slides(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_live_slides(uuid,uuid[]) to service_role;
