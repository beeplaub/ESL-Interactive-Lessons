-- Cache auth.uid() once per statement for course and lesson access policies.
-- The authorization predicates are unchanged; only their evaluation strategy
-- is optimized for larger course and lesson collections.

alter policy "Users read own certificates"
  on public.course_certificates
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy "Users enroll themselves"
  on public.course_enrollments
  with check (((select auth.uid()) = user_id) and exists (
    select 1 from public.courses c
    where c.id = course_enrollments.course_id
      and c.status = 'PUBLISHED'
      and c.visibility = 'PUBLIC'
  ));

alter policy "Users read own enrollments"
  on public.course_enrollments
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy "Published course faqs are readable"
  on public.course_faqs
  using (exists (
    select 1 from public.courses c
    where c.id = course_faqs.course_id
      and (is_admin() or (
        c.status = 'PUBLISHED'
        and (c.visibility = 'PUBLIC' or exists (
          select 1 from public.course_enrollments ce
          where ce.course_id = c.id
            and ce.user_id = (select auth.uid())
            and ce.status in ('ACTIVE', 'COMPLETED')
        ))
      ))
  ));

alter policy "Published course items are readable"
  on public.course_items
  using (exists (
    select 1 from public.courses c
    where c.id = course_items.course_id
      and (is_admin() or (
        c.status = 'PUBLISHED'
        and (c.visibility = 'PUBLIC' or exists (
          select 1 from public.course_enrollments ce
          where ce.course_id = c.id
            and ce.user_id = (select auth.uid())
            and ce.status in ('ACTIVE', 'COMPLETED')
        ))
      ))
  ));

alter policy "Users insert own orders"
  on public.course_orders
  with check ((select auth.uid()) = user_id);

alter policy "Users read own orders"
  on public.course_orders
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy "Published course content is readable"
  on public.course_outcomes
  using (exists (
    select 1 from public.courses c
    where c.id = course_outcomes.course_id
      and (is_admin() or (
        c.status = 'PUBLISHED'
        and (c.visibility = 'PUBLIC' or exists (
          select 1 from public.course_enrollments ce
          where ce.course_id = c.id
            and ce.user_id = (select auth.uid())
            and ce.status in ('ACTIVE', 'COMPLETED')
        ))
      ))
  ));

alter policy "Published course sections are readable"
  on public.course_sections
  using (exists (
    select 1 from public.courses c
    where c.id = course_sections.course_id
      and (is_admin() or (
        c.status = 'PUBLISHED'
        and (c.visibility = 'PUBLIC' or exists (
          select 1 from public.course_enrollments ce
          where ce.course_id = c.id
            and ce.user_id = (select auth.uid())
            and ce.status in ('ACTIVE', 'COMPLETED')
        ))
      ))
  ));

alter policy "Published courses are readable"
  on public.courses
  using (is_admin() or (
    status = 'PUBLISHED'
    and (visibility = 'PUBLIC' or exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = courses.id
        and ce.user_id = (select auth.uid())
        and ce.status in ('ACTIVE', 'COMPLETED')
    ))
  ));

alter policy "Admins can manage audio files"
  on public.lesson_audio_files
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Admins can delete lessons"
  on public.lessons
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Admins can insert lessons"
  on public.lessons
  with check (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Admins can update lessons"
  on public.lessons
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Anyone can view published lessons"
  on public.lessons
  using ((status = 'PUBLISHED') or exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Admins can manage slide activities"
  on public.slide_activities
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Admins can manage slides"
  on public.slides
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  ));

alter policy "Anyone can view slides of published lessons"
  on public.slides
  using (exists (
    select 1 from public.lessons
    where lessons.id = slides.lesson_id
      and (lessons.status = 'PUBLISHED' or exists (
        select 1 from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'ADMIN'
      ))
  ));
