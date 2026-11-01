-- Supabase/PostgREST now reliably exposes the JWT role through auth.role(),
-- which reads both the legacy single-claim setting and request.jwt.claims.
-- Keep these RPCs restricted to service-role server calls.
create or replace function public.get_ai_tutor_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant public.ai_tutor_grants%rowtype;
  v_today integer := 0;
  v_total integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select g.* into v_grant
  from public.ai_tutor_grants g
  where g.is_active
    and (
      g.scope_type = 'ALL'
      or (g.scope_type = 'LEARNER' and g.learner_id = p_user_id)
      or (g.scope_type = 'COURSE' and exists (
        select 1 from public.course_enrollments e
        where e.user_id = p_user_id and e.course_id = g.course_id
          and e.status in ('ACTIVE', 'COMPLETED')
      ))
    )
  order by case g.scope_type when 'LEARNER' then 1 when 'COURSE' then 2 else 3 end,
           g.updated_at desc
  limit 1;

  if v_grant.id is null then
    return jsonb_build_object('has_access', false);
  end if;

  select coalesce(sum(coalesce(s.used_minutes, s.allocated_minutes)), 0)::integer
  into v_today
  from public.ai_tutor_sessions s
  where s.user_id = p_user_id
    and s.day_bucket = (now() at time zone 'UTC')::date
    and s.status <> 'CANCELLED';

  select coalesce(sum(coalesce(s.used_minutes, s.allocated_minutes)), 0)::integer
  into v_total
  from public.ai_tutor_sessions s
  where s.user_id = p_user_id and s.status <> 'CANCELLED';

  return jsonb_build_object(
    'has_access', true,
    'grant_id', v_grant.id,
    'engine', v_grant.engine,
    'max_session_minutes', v_grant.max_session_minutes,
    'daily_minutes_limit', v_grant.daily_minutes_limit,
    'daily_minutes_used', v_today,
    'total_minutes_limit', v_grant.total_minutes_limit,
    'total_minutes_used', v_total
  );
end;
$$;

create or replace function public.reserve_ai_tutor_session(p_user_id uuid, p_requested_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant public.ai_tutor_grants%rowtype;
  v_today integer := 0;
  v_total integer := 0;
  v_minutes integer;
  v_session_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select g.* into v_grant
  from public.ai_tutor_grants g
  where g.is_active
    and (
      g.scope_type = 'ALL'
      or (g.scope_type = 'LEARNER' and g.learner_id = p_user_id)
      or (g.scope_type = 'COURSE' and exists (
        select 1 from public.course_enrollments e
        where e.user_id = p_user_id and e.course_id = g.course_id
          and e.status in ('ACTIVE', 'COMPLETED')
      ))
    )
  order by case g.scope_type when 'LEARNER' then 1 when 'COURSE' then 2 else 3 end,
           g.updated_at desc
  limit 1;

  if v_grant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'NO_ACCESS');
  end if;

  select coalesce(sum(coalesce(s.used_minutes, s.allocated_minutes)), 0)::integer
  into v_today
  from public.ai_tutor_sessions s
  where s.user_id = p_user_id
    and s.day_bucket = (now() at time zone 'UTC')::date
    and s.status <> 'CANCELLED';

  select coalesce(sum(coalesce(s.used_minutes, s.allocated_minutes)), 0)::integer
  into v_total
  from public.ai_tutor_sessions s
  where s.user_id = p_user_id and s.status <> 'CANCELLED';

  v_minutes := least(greatest(coalesce(p_requested_minutes, 1), 1), v_grant.max_session_minutes, 60);
  if v_grant.daily_minutes_limit is not null then
    v_minutes := least(v_minutes, v_grant.daily_minutes_limit - v_today);
  end if;
  if v_grant.total_minutes_limit is not null then
    v_minutes := least(v_minutes, v_grant.total_minutes_limit - v_total);
  end if;
  if v_minutes < 1 then
    return jsonb_build_object(
      'ok', false, 'reason', 'QUOTA_EXHAUSTED',
      'daily_minutes_limit', v_grant.daily_minutes_limit, 'daily_minutes_used', v_today,
      'total_minutes_limit', v_grant.total_minutes_limit, 'total_minutes_used', v_total
    );
  end if;

  insert into public.ai_tutor_sessions (grant_id, user_id, engine, allocated_minutes, expires_at)
  values (v_grant.id, p_user_id, v_grant.engine, v_minutes, now() + make_interval(mins => v_minutes))
  returning id into v_session_id;

  return jsonb_build_object(
    'ok', true, 'session_id', v_session_id, 'engine', v_grant.engine,
    'duration_minutes', v_minutes, 'max_session_minutes', v_grant.max_session_minutes,
    'daily_minutes_limit', v_grant.daily_minutes_limit, 'daily_minutes_used', v_today + v_minutes,
    'total_minutes_limit', v_grant.total_minutes_limit, 'total_minutes_used', v_total + v_minutes
  );
end;
$$;

create or replace function public.finish_ai_tutor_session(p_session_id uuid, p_user_id uuid, p_cancel boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.ai_tutor_sessions%rowtype;
  v_used integer;
  v_cancelled boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_session from public.ai_tutor_sessions
  where id = p_session_id and user_id = p_user_id and status = 'ACTIVE'
  for update;
  if not found then return false; end if;

  -- Only a session that never issued a Gemini token can return its reservation.
  v_cancelled := p_cancel and v_session.token_issued_at is null;
  v_used := case
    when v_cancelled then 0
    when p_cancel and v_session.token_issued_at is not null then v_session.allocated_minutes
    else least(
      v_session.allocated_minutes,
      greatest(1, ceil(extract(epoch from (now() - v_session.started_at)) / 60)::integer)
    )
  end;
  update public.ai_tutor_sessions
  set status = case when v_cancelled then 'CANCELLED' else 'FINISHED' end,
      used_minutes = v_used, ended_at = now()
  where id = p_session_id;
  return true;
end;
$$;

revoke all on function public.get_ai_tutor_access(uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai_tutor_session(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_tutor_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_ai_tutor_access(uuid) to service_role;
grant execute on function public.reserve_ai_tutor_session(uuid, integer) to service_role;
grant execute on function public.finish_ai_tutor_session(uuid, uuid, boolean) to service_role;
