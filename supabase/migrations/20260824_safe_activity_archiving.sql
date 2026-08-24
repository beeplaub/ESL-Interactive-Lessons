-- Preserve learner evidence when creators remove an activity from a lesson.
alter table public.lesson_slide_activities
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists lesson_slide_activities_active_idx
  on public.lesson_slide_activities(lesson_id, slide_number)
  where deleted_at is null;

-- A lesson activity attempt is valid when it points to the activity source.
-- Older deployments had a stale check that rejected valid LESSON_ACTIVITY rows.
alter table public.assessment_attempts drop constraint if exists assessment_attempts_check;
alter table public.assessment_attempts add constraint assessment_attempts_check check (
  (source_type = 'QUIZ' and (quiz_id is not null or source_deleted_at is not null) and lesson_activity_id is null)
  or
  (source_type = 'LESSON_ACTIVITY' and (lesson_activity_id is not null or source_deleted_at is not null) and quiz_id is null)
);

-- Historical attempts survive activity removal and retain their original score.
alter table public.assessment_attempts drop constraint if exists assessment_attempts_lesson_activity_id_fkey;
alter table public.assessment_attempts add constraint assessment_attempts_lesson_activity_id_fkey
  foreign key (lesson_activity_id) references public.lesson_slide_activities(id) on delete set null;
