-- The helper is intentionally callable by authenticated sessions because RLS
-- policies use it, but it must never be exposed to anonymous callers.
revoke all on function public.can_manage_course_staff(uuid) from public;
revoke all on function public.can_manage_course_staff(uuid) from anon;
grant execute on function public.can_manage_course_staff(uuid) to authenticated;
grant execute on function public.can_manage_course_staff(uuid) to service_role;
