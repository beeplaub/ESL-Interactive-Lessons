-- A learner may self-enroll only when a public published course is explicitly
-- marked free. NULL means the price is not configured; it must never grant access.
drop policy if exists "Users enroll themselves" on public.course_enrollments;

create policy "Users enroll themselves"
on public.course_enrollments for insert
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.courses c
    where c.id = course_enrollments.course_id
      and c.status = 'PUBLISHED'
      and c.visibility = 'PUBLIC'
      and c.price_bdt = 0
  )
);
