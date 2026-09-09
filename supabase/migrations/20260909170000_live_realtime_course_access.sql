-- Keep realtime authorization aligned with the HTTP live-class access checks.
-- Learners enrolled in a course must be able to subscribe to its live board,
-- even when they are not explicitly listed in a class roster.
create or replace function public.can_access_live_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_sessions s
    where s.id = target_session_id
      and (
        public.is_admin()
        or s.teacher_id = auth.uid()
        or exists (
          select 1
          from public.class_members cm
          where cm.class_id = s.class_id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.course_enrollments ce
          where ce.course_id = s.course_id
            and ce.user_id = auth.uid()
            and ce.status in ('ACTIVE', 'COMPLETED')
        )
      )
  );
$$;
