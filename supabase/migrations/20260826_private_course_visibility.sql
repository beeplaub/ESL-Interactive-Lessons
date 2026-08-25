-- Public/private course visibility.
-- Existing published courses remain public; private courses use the existing
-- course_enrollments table as their explicit learner allow-list.

alter table public.courses
  add column if not exists visibility text not null default 'PUBLIC';

update public.courses
set visibility = 'PUBLIC'
where visibility is null or visibility not in ('PUBLIC', 'PRIVATE');

alter table public.courses
  drop constraint if exists courses_visibility_check;

alter table public.courses
  add constraint courses_visibility_check
  check (visibility in ('PUBLIC', 'PRIVATE'));

create index if not exists courses_visibility_status_idx
  on public.courses(visibility, status, created_at desc);

-- A private course can be read by its active/completed learners, or by a
-- platform admin. Course content follows the same visibility rule.
drop policy if exists "Published courses are readable" on public.courses;
create policy "Published courses are readable"
on public.courses for select
using (
  public.is_admin()
  or (
    status = 'PUBLISHED'
    and (
      visibility = 'PUBLIC'
      or exists (
        select 1
        from public.course_enrollments ce
        where ce.course_id = courses.id
          and ce.user_id = auth.uid()
          and ce.status in ('ACTIVE', 'COMPLETED')
      )
    )
  )
);

drop policy if exists "Published course content is readable" on public.course_outcomes;
create policy "Published course content is readable"
on public.course_outcomes for select
using (exists (select 1 from public.courses c where c.id = course_id and (
  public.is_admin() or (c.status = 'PUBLISHED' and (
    c.visibility = 'PUBLIC' or exists (select 1 from public.course_enrollments ce where ce.course_id = c.id and ce.user_id = auth.uid() and ce.status in ('ACTIVE', 'COMPLETED'))
  ))
)));

drop policy if exists "Published course faqs are readable" on public.course_faqs;
create policy "Published course faqs are readable"
on public.course_faqs for select
using (exists (select 1 from public.courses c where c.id = course_id and (
  public.is_admin() or (c.status = 'PUBLISHED' and (c.visibility = 'PUBLIC' or exists (select 1 from public.course_enrollments ce where ce.course_id = c.id and ce.user_id = auth.uid() and ce.status in ('ACTIVE', 'COMPLETED'))))
)));

drop policy if exists "Published course sections are readable" on public.course_sections;
create policy "Published course sections are readable"
on public.course_sections for select
using (exists (select 1 from public.courses c where c.id = course_id and (
  public.is_admin() or (c.status = 'PUBLISHED' and (c.visibility = 'PUBLIC' or exists (select 1 from public.course_enrollments ce where ce.course_id = c.id and ce.user_id = auth.uid() and ce.status in ('ACTIVE', 'COMPLETED'))))
)));

drop policy if exists "Published course items are readable" on public.course_items;
create policy "Published course items are readable"
on public.course_items for select
using (exists (select 1 from public.courses c where c.id = course_id and (
  public.is_admin() or (c.status = 'PUBLISHED' and (c.visibility = 'PUBLIC' or exists (select 1 from public.course_enrollments ce where ce.course_id = c.id and ce.user_id = auth.uid() and ce.status in ('ACTIVE', 'COMPLETED'))))
)));

-- Learners may self-enroll only in public courses. Private access is granted
-- by the creator/admin enrollment workflow.
drop policy if exists "Users enroll themselves" on public.course_enrollments;
create policy "Users enroll themselves"
on public.course_enrollments for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.courses c
    where c.id = course_id and c.status = 'PUBLISHED' and c.visibility = 'PUBLIC'
  )
);
