-- Additive local creator workflow. Only the application service may write;
-- authenticated admins can read their own sessions/history through RLS.
create table public.creator_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New lesson conversation',
  lesson_id uuid references public.lessons(id) on delete set null,
  state jsonb not null default '{}'::jsonb,
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creator_agent_sessions_owner on public.creator_agent_sessions(user_id, updated_at desc);
create table public.creator_agent_changes (
  id uuid primary key,
  session_id uuid not null references public.creator_agent_sessions(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  lesson_id uuid not null references public.lessons(id),
  before_document jsonb,
  after_document jsonb not null,
  after_revision text not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create index creator_agent_changes_session on public.creator_agent_changes(session_id, created_at desc);
alter table public.creator_agent_sessions enable row level security;
alter table public.creator_agent_changes enable row level security;
revoke all on public.creator_agent_sessions, public.creator_agent_changes from anon, authenticated;
grant select on public.creator_agent_sessions, public.creator_agent_changes to authenticated;
grant all on public.creator_agent_sessions, public.creator_agent_changes to service_role;
create policy creator_agent_sessions_read on public.creator_agent_sessions for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'ADMIN'));
create policy creator_agent_changes_read on public.creator_agent_changes for select to authenticated
using (actor_id = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'ADMIN'));

create function public.creator_agent_snapshot(p_lesson uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'document', jsonb_build_object(
      'lesson', jsonb_build_object('id', l.id, 'title', l.title, 'topic', coalesce(l.topic,''), 'level', coalesce(l.level,'B1'),
        'description', coalesce(l.description,''), 'subtitle', coalesce(l.subtitle,''), 'category', coalesce(l.category,'')),
      'slides', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', coalesce(s.title,''), 'section_label', coalesce(s.section_label,''), 'raw_text', coalesce(s.raw_text,''),
        'type', s.type, 'content_order', s.content_order, 'require_practice_before_learn', s.require_practice_before_learn,
        'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id,'block_type', b.block_type,'content', b.content) order by b.position,b.id) from public.lesson_blocks b where b.slide_id=s.id and b.lesson_id=l.id),'[]'::jsonb),
        'activities', coalesce((select jsonb_agg(jsonb_build_object('id', a.id,'activity_type', a.activity_type,'activity_data', coalesce(a.activity_data,'{}'::jsonb),'needs_review', a.needs_review) order by a.position nulls last,a.created_at,a.id) from public.lesson_slide_activities a where a.slide_id=s.id and a.lesson_id=l.id and a.deleted_at is null),'[]'::jsonb)
      ) order by s.slide_number,s.id) from public.slides s where s.lesson_id=l.id and s.deleted_at is null),'[]'::jsonb)),
    'status', l.status,
    'revision', md5(jsonb_build_object('lesson',to_jsonb(l),
      'slides',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.slides s where s.lesson_id=l.id),'[]'::jsonb),
      'blocks',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.lesson_blocks b where b.lesson_id=l.id),'[]'::jsonb),
      'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.lesson_slide_activities a where a.lesson_id=l.id),'[]'::jsonb))::text)
  ) from public.lessons l where l.id=p_lesson and l.deleted_at is null;
$$;
revoke all on function public.creator_agent_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.creator_agent_snapshot(uuid) to service_role;

-- One short transaction: compare revision, apply the whole validated change,
-- read back, record undo history. No model-generated SQL or field names.
create function public.creator_agent_commit(
  p_actor uuid, p_session uuid, p_change uuid, p_expected text, p_document jsonb, p_summary jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  lid uuid := (p_document->'lesson'->>'id')::uuid;
  before_state jsonb; after_state jsonb; prior public.creator_agent_changes%rowtype;
  s jsonb; b jsonb; a jsonb; sid uuid; bid uuid; aid uuid; sn integer := 0; pos integer;
  slide_ids uuid[] := '{}'; block_ids uuid[] := '{}'; activity_ids uuid[] := '{}';
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='ADMIN') then raise exception 'ADMIN_REQUIRED'; end if;
  perform 1 from public.creator_agent_sessions where id=p_session and user_id=p_actor for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into prior from public.creator_agent_changes where id=p_change;
  if found then
    if prior.actor_id<>p_actor or prior.session_id<>p_session then raise exception 'ACTION_NOT_FOUND'; end if;
    return jsonb_build_object('document',prior.after_document,'revision',prior.after_revision,'status','DRAFT','replayed',true);
  end if;
  if pg_column_size(p_document)>2000000 or jsonb_array_length(p_document->'slides')>100 then raise exception 'DOCUMENT_TOO_LARGE'; end if;
  -- Brief table locks also serialize existing manual-editor writes/inserts,
  -- which do not yet participate in the agent's optimistic revision protocol.
  lock table public.lessons, public.slides, public.lesson_blocks, public.lesson_slide_activities in share row exclusive mode;
  before_state := public.creator_agent_snapshot(lid);
  if before_state is not null then
    if before_state->>'status'<>'DRAFT' then raise exception 'PUBLISHED_LESSON_REQUIRES_DRAFT_COPY'; end if;
    if p_expected is distinct from before_state->>'revision' then raise exception 'LESSON_CHANGED_RELOAD_BEFORE_SAVING'; end if;
  elsif p_expected is not null then raise exception 'LESSON_NOT_FOUND';
  end if;
  for s in select value from jsonb_array_elements(p_document->'slides') loop
    sid := (s->>'id')::uuid;
    if sid=any(slide_ids) or exists(select 1 from public.slides where id=sid and lesson_id<>lid) then raise exception 'INVALID_SLIDE_ID'; end if;
    slide_ids := array_append(slide_ids,sid);
    for b in select value from jsonb_array_elements(s->'blocks') loop
      bid := (b->>'id')::uuid;
      if bid=any(block_ids) or exists(select 1 from public.lesson_blocks where id=bid and lesson_id<>lid) then raise exception 'INVALID_BLOCK_ID'; end if;
      block_ids := array_append(block_ids,bid);
    end loop;
    for a in select value from jsonb_array_elements(s->'activities') loop
      aid := (a->>'id')::uuid;
      if aid=any(activity_ids) or exists(select 1 from public.lesson_slide_activities where id=aid and lesson_id<>lid) then raise exception 'INVALID_ACTIVITY_ID'; end if;
      activity_ids := array_append(activity_ids,aid);
    end loop;
  end loop;
  if before_state is null then
    insert into public.lessons(id,title,topic,level,description,subtitle,category,pdf_path,status,created_by)
    values(lid,p_document->'lesson'->>'title',p_document->'lesson'->>'topic',p_document->'lesson'->>'level',p_document->'lesson'->>'description',p_document->'lesson'->>'subtitle',p_document->'lesson'->>'category','builder/'||lid,'DRAFT',p_actor);
  else
    update public.lessons set title=p_document->'lesson'->>'title', topic=p_document->'lesson'->>'topic', level=p_document->'lesson'->>'level',
      description=p_document->'lesson'->>'description',subtitle=p_document->'lesson'->>'subtitle',category=p_document->'lesson'->>'category',updated_at=now() where id=lid;
  end if;
  -- Move all existing positions out of the positive range before reordering.
  update public.slides set slide_number=-1000000-t.n from (select id,row_number() over(order by id)::integer n from public.slides where lesson_id=lid) t where slides.id=t.id;
  update public.lesson_blocks set position=-1000000-t.n from (select id,row_number() over(order by id)::integer n from public.lesson_blocks where lesson_id=lid) t where lesson_blocks.id=t.id;
  update public.slides set deleted_at=coalesce(deleted_at,now()),deleted_by=p_actor where lesson_id=lid and not(id=any(slide_ids));
  -- Preserve blocks on removed slides for the existing slide trash/restore UI.
  delete from public.lesson_blocks where lesson_id=lid and slide_id=any(slide_ids) and not(id=any(block_ids));
  update public.lesson_slide_activities set deleted_at=now(),deleted_by=p_actor where lesson_id=lid and deleted_at is null and not(id=any(activity_ids));
  for s in select value from jsonb_array_elements(p_document->'slides') loop
    sn := sn+1; sid := (s->>'id')::uuid;
    insert into public.slides(id,lesson_id,slide_number,title,section_label,raw_text,type,content_order,require_practice_before_learn)
    values(sid,lid,sn,s->>'title',s->>'section_label',s->>'raw_text',s->>'type',s->>'content_order',(s->>'require_practice_before_learn')::boolean)
    on conflict(id) do update set slide_number=excluded.slide_number,title=excluded.title,section_label=excluded.section_label,raw_text=excluded.raw_text,
      content_order=excluded.content_order,require_practice_before_learn=excluded.require_practice_before_learn,deleted_at=null,deleted_by=null;
    pos := 0;
    for b in select value from jsonb_array_elements(s->'blocks') loop
      pos := pos+1;
      insert into public.lesson_blocks(id,lesson_id,slide_id,position,block_type,content)
      values((b->>'id')::uuid,lid,sid,pos,b->>'block_type',b->'content')
      on conflict(id) do update set slide_id=excluded.slide_id,position=excluded.position,block_type=excluded.block_type,content=excluded.content;
    end loop;
    pos := 0;
    for a in select value from jsonb_array_elements(s->'activities') loop
      pos := pos+1;
      insert into public.lesson_slide_activities(id,lesson_id,slide_id,slide_number,position,activity_type,activity_data,needs_review,raw_text)
      values((a->>'id')::uuid,lid,sid,sn,pos,a->>'activity_type',a->'activity_data',(a->>'needs_review')::boolean,a->'activity_data'->>'prompt')
      on conflict(id) do update set slide_id=excluded.slide_id,slide_number=excluded.slide_number,position=excluded.position,
        activity_type=excluded.activity_type,activity_data=excluded.activity_data,needs_review=excluded.needs_review,raw_text=excluded.raw_text,deleted_at=null,deleted_by=null,updated_at=now();
    end loop;
  end loop;
  after_state := public.creator_agent_snapshot(lid);
  insert into public.creator_agent_changes(id,session_id,actor_id,lesson_id,before_document,after_document,after_revision,summary)
  values(p_change,p_session,p_actor,lid,before_state->'document',after_state->'document',after_state->>'revision',p_summary);
  update public.creator_agent_sessions set lesson_id=lid,updated_at=now() where id=p_session;
  return after_state;
end;
$$;
revoke all on function public.creator_agent_commit(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.creator_agent_commit(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
