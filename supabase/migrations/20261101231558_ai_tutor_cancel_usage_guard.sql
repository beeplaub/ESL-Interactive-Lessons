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
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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

revoke all on function public.finish_ai_tutor_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_ai_tutor_session(uuid, uuid, boolean) to service_role;
