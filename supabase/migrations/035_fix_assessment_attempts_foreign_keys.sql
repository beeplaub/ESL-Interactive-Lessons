-- Migration 035: Fix assessment_attempts foreign key constraints and check constraints
-- Prevents server-side error when deleting lesson slides or activities with existing attempts.

alter table public.assessment_attempts drop constraint if exists assessment_attempts_check;

alter table public.assessment_attempts drop constraint if exists assessment_attempts_lesson_activity_id_fkey;
alter table public.assessment_attempts add constraint assessment_attempts_lesson_activity_id_fkey
  foreign key (lesson_activity_id) references public.lesson_slide_activities(id) on delete cascade;

alter table public.assessment_attempts drop constraint if exists assessment_attempts_quiz_id_fkey;
alter table public.assessment_attempts add constraint assessment_attempts_quiz_id_fkey
  foreign key (quiz_id) references public.quizzes(id) on delete cascade;

alter table public.assessment_attempts add constraint assessment_attempts_check check (
  (source_type = 'QUIZ')
  or
  (source_type = 'LESSON_ACTIVITY')
);
