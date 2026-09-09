-- A board belongs to a class session; lessons and assessment data are untouched.
create table public.live_whiteboards (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  revision integer not null default 0,
  document jsonb not null default '{"objects":{},"settings":{"editing":false,"prompt":"Use the picture to make a sentence. Try to use every day!","timerEnd":null,"timerSeconds":300,"view":"board","slide":1}}'::jsonb,
  operations jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint board_size check (octet_length(document::text) <= 2000000)
);
alter table public.live_whiteboards enable row level security;
grant select on public.live_whiteboards to authenticated;
grant all on public.live_whiteboards to service_role;
create policy "Class members read their whiteboard" on public.live_whiteboards
for select to authenticated using (public.can_access_live_session(session_id));

-- Only the authorized server route may call this transaction. Row locking and
-- per-object revisions prevent concurrent changes silently replacing each other.
create function public.mutate_live_whiteboard(p_session uuid, p_teacher boolean, p_mutation jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare b public.live_whiteboards; c jsonb; obj jsonb; expected integer; next_revision integer;
begin
  if not exists(select 1 from public.live_sessions where id=p_session and status='LIVE') then raise exception 'Class changed'; end if;
  insert into public.live_whiteboards(session_id) values(p_session) on conflict do nothing;
  select * into b from public.live_whiteboards where session_id=p_session for update;
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
  update public.live_whiteboards set document=b.document,revision=next_revision,operations=b.operations,updated_at=now() where session_id=p_session;
  return b.document || jsonb_build_object('revision',next_revision);
end;
$$;
revoke all on function public.mutate_live_whiteboard(uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.mutate_live_whiteboard(uuid,boolean,jsonb) to service_role;

-- Private room membership for cursor hints and save notifications. Authoritative
-- board content is always fetched through the freshly authorized HTTP route.
create policy "Whiteboard members receive realtime" on realtime.messages
for select to authenticated using (
  realtime.topic() ~ '^whiteboard:[0-9a-f-]{36}$' and
  public.can_access_live_session(case when realtime.topic() ~ '^whiteboard:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(realtime.topic(),':',2)::uuid else null end)
);
create policy "Whiteboard members send realtime" on realtime.messages
for insert to authenticated with check (
  realtime.topic() ~ '^whiteboard:[0-9a-f-]{36}$' and
  public.can_access_live_session(case when realtime.topic() ~ '^whiteboard:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(realtime.topic(),':',2)::uuid else null end)
);
