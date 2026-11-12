-- Permanently remove a cancelled learner's records scoped to one course.
-- The learner account and records for every other course are left untouched.
create or replace function public.remove_cancelled_course_learner(
  p_course_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
returns table(receipt_paths text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt_paths text[] := array[]::text[];
  v_enrollment_id uuid;
  v_course_path text := '/courses/' || p_course_id::text;
  v_deleted integer;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id and p.role::text = 'ADMIN'
  ) then
    raise exception 'Only a platform admin can permanently remove a course learner.';
  end if;

  -- Serialize removal against an order status update before checking the
  -- enrollment, so stale order actions cannot silently target a deleted row.
  perform o.id
  from public.course_orders o
  where o.course_id = p_course_id and o.user_id = p_user_id
  order by o.id
  for update;

  select e.id into v_enrollment_id
  from public.course_enrollments e
  where e.course_id = p_course_id
    and e.user_id = p_user_id
    and e.status = 'CANCELLED'
  for update;

  if v_enrollment_id is null then
    raise exception 'Only a cancelled learner can be permanently removed.';
  end if;

  select coalesce(array_agg(o.receipt_path) filter (where o.receipt_path is not null), array[]::text[])
  into v_receipt_paths
  from public.course_orders o
  where o.course_id = p_course_id and o.user_id = p_user_id;

  delete from public.user_notifications n
  where n.user_id = p_user_id
    and (n.href = v_course_path or left(n.href, length(v_course_path) + 1) = v_course_path || '/');

  delete from public.course_certificates c
  where c.course_id = p_course_id and c.user_id = p_user_id;

  delete from public.course_item_progress p
  where p.course_id = p_course_id and p.user_id = p_user_id;

  delete from public.course_progress p
  where p.course_id = p_course_id and p.user_id = p_user_id;

  -- Child item and outcome rollups cascade from this course-scoped result.
  delete from public.course_assessment_results r
  where r.course_id = p_course_id and r.user_id = p_user_id;

  delete from public.course_orders o
  where o.course_id = p_course_id and o.user_id = p_user_id;

  delete from public.course_enrollments e
  where e.id = v_enrollment_id
    and e.course_id = p_course_id
    and e.user_id = p_user_id
    and e.status = 'CANCELLED';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'The learner status changed before removal. Refresh and try again.';
  end if;

  return query select v_receipt_paths;
end;
$$;

revoke all on function public.remove_cancelled_course_learner(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_cancelled_course_learner(uuid, uuid, uuid) to service_role;
