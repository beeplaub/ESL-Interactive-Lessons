-- Connect subjective grading records to official assessment evidence and make
-- legacy attempt history capable of representing an unfinished grade.

alter table public.writing_submissions
  add column if not exists question_key text not null default '1',
  add column if not exists mode text,
  add column if not exists self_marked boolean,
  add column if not exists ai_score numeric(5,2),
  add column if not exists ai_feedback jsonb,
  add column if not exists assessment_attempt_id uuid references public.assessment_attempts(id) on delete set null,
  add column if not exists assessment_response_id uuid references public.assessment_responses(id) on delete set null;

alter table public.writing_submissions drop constraint if exists writing_submissions_mode_check;
alter table public.writing_submissions add constraint writing_submissions_mode_check
  check (mode is null or mode in ('SELF_GRADED', 'AI_FEEDBACK', 'TEACHER_REVIEW'));

create unique index if not exists writing_submissions_learner_activity_question_idx
  on public.writing_submissions(learner_id, activity_id, question_key);
create index if not exists writing_submissions_assessment_attempt_idx
  on public.writing_submissions(assessment_attempt_id);
create index if not exists writing_submissions_assessment_response_idx
  on public.writing_submissions(assessment_response_id);

alter table public.quiz_attempts
  add column if not exists status text not null default 'FINALIZED',
  add column if not exists grading_source text not null default 'AUTO',
  add column if not exists assessment_attempt_id uuid references public.assessment_attempts(id) on delete set null;

alter table public.quiz_attempts drop constraint if exists quiz_attempts_status_check;
alter table public.quiz_attempts add constraint quiz_attempts_status_check
  check (status in ('SUBMITTED', 'PENDING_REVIEW', 'FINALIZED', 'VOID'));
alter table public.quiz_attempts drop constraint if exists quiz_attempts_grading_source_check;
alter table public.quiz_attempts add constraint quiz_attempts_grading_source_check
  check (grading_source in ('AUTO', 'AI', 'TEACHER', 'SELF', 'MIXED'));

create index if not exists quiz_attempts_assessment_attempt_idx
  on public.quiz_attempts(assessment_attempt_id);
