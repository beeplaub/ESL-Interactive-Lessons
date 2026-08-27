-- Cache auth.uid() once per statement for the assessment and progress paths.
-- Authorization predicates are unchanged; only their evaluation strategy is
-- optimized for tables that can contain many learner records.

alter policy "Users manage own course item progress"
  on public.course_item_progress
  using ((user_id = (select auth.uid()) or is_admin()))
  with check ((user_id = (select auth.uid()) or is_admin()));

alter policy "Users read own course item progress"
  on public.course_item_progress
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy "Users manage own course progress"
  on public.course_progress
  using ((user_id = (select auth.uid()) or is_admin()))
  with check ((user_id = (select auth.uid()) or is_admin()));

alter policy "Users read own course progress"
  on public.course_progress
  using ((user_id = (select auth.uid()) or is_admin()));

alter policy "Users can insert their own progress"
  on public.lesson_progress
  with check ((select auth.uid()) = user_id);

alter policy "Users can update their own progress"
  on public.lesson_progress
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own progress"
  on public.lesson_progress
  using ((select auth.uid()) = user_id);

alter policy "Users insert own quiz attempts"
  on public.quiz_attempts
  with check ((select auth.uid()) = user_id);

alter policy "Users read own quiz attempts"
  on public.quiz_attempts
  using ((select auth.uid()) = user_id);

alter policy "quiz attempts own insert"
  on public.quiz_attempts
  with check ((select auth.uid()) = user_id);

alter policy "quiz attempts own read"
  on public.quiz_attempts
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Admins manage writing submissions"
  on public.writing_submissions
  using (exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = any (array['ADMIN'::text, 'SUPER_ADMIN'::text, 'INSTRUCTOR'::text, 'TEACHER'::text])
  ));

alter policy "Learners insert own writing submissions"
  on public.writing_submissions
  with check ((select auth.uid()) = learner_id);

alter policy "Learners view own writing submissions"
  on public.writing_submissions
  using ((select auth.uid()) = learner_id);
