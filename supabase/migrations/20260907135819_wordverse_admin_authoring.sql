alter table public.wordverse_topics
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'PUBLISHED' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  add column if not exists updated_at timestamptz not null default now();
alter table public.wordverse_words alter column status set default 'DRAFT';
create trigger wordverse_topics_touch_updated_at before update on public.wordverse_topics
for each row execute function public.touch_updated_at();

alter policy "Authenticated learners read Wordverse topics" on public.wordverse_topics using (status = 'PUBLISHED');
alter policy "Authenticated learners read published Wordverse words" on public.wordverse_words
using (status = 'PUBLISHED' and exists (select 1 from public.wordverse_topics t where t.id = topic_id and t.status = 'PUBLISHED'));

-- Only the freshly authorized server actions can call these transactional operations.
create or replace function public.wordverse_admin_save(p_id uuid, p_expected timestamptz, p_word jsonb, p_links jsonb, p_status text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_old public.wordverse_words; v public.wordverse_words;
begin
  perform pg_advisory_xact_lock(70320260907);
  if p_status not in ('DRAFT','PUBLISHED','ARCHIVED') then raise exception 'Invalid status'; end if;
  if p_id is not null then
    select * into v_old from public.wordverse_words where id = p_id for update;
    if not found or v_old.updated_at is distinct from p_expected then raise exception 'This word changed. Reload before saving.'; end if;
  elsif p_status <> 'DRAFT' then raise exception 'Create a draft first'; end if;
  select * into v from jsonb_populate_record(null::public.wordverse_words, p_word);
  if p_status = 'PUBLISHED' then
    if length(trim(coalesce(v.definition,''))) < 15 or coalesce(v.word_class,'') = '' or coalesce(v.cefr_level,'') = '' or jsonb_array_length(v.examples) = 0 then
      raise exception 'Complete the definition, word class, CEFR and examples before publishing';
    end if;
    if not exists(select 1 from public.wordverse_topics where id=v.topic_id and status='PUBLISHED') then raise exception 'Publish the galaxy first'; end if;
  end if;
  if p_id is null then
    insert into public.wordverse_words(slug,word,definition,status) values(v.slug,v.word,v.definition,'DRAFT') returning id into v_id;
  else v_id := p_id; end if;
  update public.wordverse_words set slug=v.slug, word=v.word, definition=v.definition, topic_id=v.topic_id,
    pronunciation=v.pronunciation, translation=v.translation, word_class=v.word_class, cefr_level=v.cefr_level,
    examples=v.examples, collocations=v.collocations, synonyms=v.synonyms, antonyms=v.antonyms, word_family=v.word_family,
    grammar_patterns=v.grammar_patterns, common_mistakes=v.common_mistakes, register=v.register, origin=v.origin,
    audio_url=v.audio_url, frequency_score=v.frequency_score, status=p_status where id=v_id;
  if exists(select 1 from jsonb_to_recordset(p_links) as l(target_word_id uuid) where l.target_word_id=v_id) then raise exception 'A word cannot connect to itself'; end if;
  -- The editor owns outgoing links; incoming links are never silently deleted.
  delete from public.wordverse_relationships r where r.source_word_id=v_id and not exists(
    select 1 from jsonb_to_recordset(p_links) as l(target_word_id uuid,relationship_type text,strength int)
    where l.target_word_id=r.target_word_id and l.relationship_type=r.relationship_type);
  insert into public.wordverse_relationships(source_word_id,target_word_id,relationship_type,strength)
    select v_id,l.target_word_id,l.relationship_type,l.strength from jsonb_to_recordset(p_links) as l(target_word_id uuid,relationship_type text,strength int)
    on conflict(source_word_id,target_word_id,relationship_type) do update set strength=excluded.strength;
  if p_status='PUBLISHED' and not exists(
    select 1 from public.wordverse_relationships r join public.wordverse_words w on w.id=case when r.source_word_id=v_id then r.target_word_id else r.source_word_id end
    join public.wordverse_topics t on t.id=w.topic_id and t.status='PUBLISHED'
    where (r.source_word_id=v_id or r.target_word_id=v_id) and w.status='PUBLISHED'
  ) then raise exception 'Connect this word to another published word before publishing'; end if;
  return v_id;
end $$;
revoke all on function public.wordverse_admin_save(uuid,timestamptz,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.wordverse_admin_save(uuid,timestamptz,jsonb,jsonb,text) to service_role;

create or replace function public.wordverse_admin_publish(p_ids uuid[])
returns integer language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(70320260907);
  if cardinality(p_ids) is null or cardinality(p_ids)=0 or cardinality(p_ids)>500 then raise exception 'Select 1 to 500 drafts'; end if;
  perform 1 from public.wordverse_words where id=any(p_ids) for update;
  if (select count(*) from public.wordverse_words where id=any(p_ids) and status='DRAFT') <> cardinality(p_ids) then raise exception 'Draft selection changed. Refresh.'; end if;
  if exists(select 1 from public.wordverse_words w left join public.wordverse_topics t on t.id=w.topic_id where w.id=any(p_ids) and (
    t.status is distinct from 'PUBLISHED' or length(trim(w.definition))<15 or coalesce(w.word_class,'')='' or coalesce(w.cefr_level,'')='' or jsonb_array_length(w.examples)=0
  )) then raise exception 'Every draft needs a published galaxy, definition, word class, CEFR and example'; end if;
  if exists(
    with recursive eligible as (select w.id from public.wordverse_words w join public.wordverse_topics t on t.id=w.topic_id where t.status='PUBLISHED' and (w.status='PUBLISHED' or w.id=any(p_ids))),
    reachable(id) as (
      select w.id from public.wordverse_words w join eligible e on e.id=w.id where w.status='PUBLISHED'
      union
      select case when r.source_word_id=q.id then r.target_word_id else r.source_word_id end from reachable q
      join public.wordverse_relationships r on r.source_word_id=q.id or r.target_word_id=q.id
      join eligible e on e.id=case when r.source_word_id=q.id then r.target_word_id else r.source_word_id end
    ) select 1 from unnest(p_ids) i where not exists(select 1 from reachable r where r.id=i)
  ) then raise exception 'Connect every selected draft to the published network'; end if;
  update public.wordverse_words set status='PUBLISHED' where id=any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.wordverse_admin_publish(uuid[]) from public, anon, authenticated;
grant execute on function public.wordverse_admin_publish(uuid[]) to service_role;
