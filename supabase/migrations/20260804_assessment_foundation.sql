-- BrenUp assessment foundation hardening.
-- This migration is additive and preserves legacy attempts and responses.

alter table public.assessment_items
  add column if not exists source_deleted_at timestamptz,
  add column if not exists source_label_snapshot text,
  add column if not exists source_key_snapshot text;

alter table public.assessment_items drop constraint if exists assessment_items_check;
alter table public.assessment_items drop constraint if exists assessment_items_quiz_question_id_fkey;
alter table public.assessment_items drop constraint if exists assessment_items_lesson_activity_id_fkey;

alter table public.assessment_items
  add constraint assessment_items_quiz_question_id_fkey
    foreign key (quiz_question_id) references public.quiz_questions(id) on delete set null,
  add constraint assessment_items_lesson_activity_id_fkey
    foreign key (lesson_activity_id) references public.lesson_slide_activities(id) on delete set null,
  add constraint assessment_items_check check (
    (
      source_type = 'QUIZ_QUESTION'
      and lesson_activity_id is null
      and (quiz_question_id is not null or source_deleted_at is not null)
    )
    or
    (
      source_type = 'LESSON_ACTIVITY_QUESTION'
      and quiz_question_id is null
      and (lesson_activity_id is not null or source_deleted_at is not null)
    )
  );

alter table public.assessment_attempts
  add column if not exists status text,
  add column if not exists grading_source text,
  add column if not exists score_percent numeric,
  add column if not exists submission_key text,
  add column if not exists grading_version integer,
  add column if not exists submitted_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists source_label_snapshot text,
  add column if not exists source_key_snapshot text;

update public.assessment_attempts
set
  status = coalesce(status, 'FINALIZED'),
  grading_source = coalesce(grading_source, 'AUTO'),
  grading_version = coalesce(grading_version, 1),
  submitted_at = coalesce(submitted_at, completed_at),
  finalized_at = coalesce(finalized_at, completed_at),
  score_percent = coalesce(score_percent, case when maximum_score > 0 then round((score / maximum_score) * 100, 2) else 0 end)
where status is null
   or grading_source is null
   or grading_version is null
   or submitted_at is null
   or finalized_at is null
   or score_percent is null;

alter table public.assessment_attempts
  alter column status set default 'FINALIZED',
  alter column status set not null,
  alter column grading_source set default 'AUTO',
  alter column grading_source set not null,
  alter column grading_version set default 1,
  alter column grading_version set not null,
  alter column submitted_at set default now(),
  alter column submitted_at set not null;

alter table public.assessment_attempts drop constraint if exists assessment_attempts_status_check;
alter table public.assessment_attempts drop constraint if exists assessment_attempts_grading_source_check;
alter table public.assessment_attempts drop constraint if exists assessment_attempts_score_percent_check;
alter table public.assessment_attempts add constraint assessment_attempts_status_check
  check (status in ('SUBMITTED', 'PENDING_REVIEW', 'FINALIZED', 'VOID'));
alter table public.assessment_attempts add constraint assessment_attempts_grading_source_check
  check (grading_source in ('AUTO', 'AI', 'TEACHER', 'SELF'));
alter table public.assessment_attempts add constraint assessment_attempts_score_percent_check
  check (score_percent is null or score_percent between 0 and 100);

alter table public.assessment_attempts drop constraint if exists assessment_attempts_lesson_activity_id_fkey;
alter table public.assessment_attempts drop constraint if exists assessment_attempts_quiz_id_fkey;
alter table public.assessment_attempts
  add constraint assessment_attempts_lesson_activity_id_fkey
    foreign key (lesson_activity_id) references public.lesson_slide_activities(id) on delete set null,
  add constraint assessment_attempts_quiz_id_fkey
    foreign key (quiz_id) references public.quizzes(id) on delete set null;

alter table public.assessment_responses
  add column if not exists grading_status text,
  add column if not exists grading_source text,
  add column if not exists feedback text,
  add column if not exists rubric_data jsonb,
  add column if not exists item_snapshot jsonb,
  add column if not exists mapping_snapshot jsonb,
  add column if not exists finalized_at timestamptz;

update public.assessment_responses
set
  grading_status = coalesce(grading_status, 'FINALIZED'),
  grading_source = coalesce(grading_source, 'AUTO'),
  finalized_at = coalesce(finalized_at, submitted_at)
where grading_status is null or grading_source is null or finalized_at is null;

alter table public.assessment_responses
  alter column grading_status set default 'FINALIZED',
  alter column grading_status set not null,
  alter column grading_source set default 'AUTO',
  alter column grading_source set not null;

alter table public.assessment_responses drop constraint if exists assessment_responses_grading_status_check;
alter table public.assessment_responses drop constraint if exists assessment_responses_grading_source_check;
alter table public.assessment_responses add constraint assessment_responses_grading_status_check
  check (grading_status in ('FINALIZED', 'PENDING_REVIEW', 'VOID'));
alter table public.assessment_responses add constraint assessment_responses_grading_source_check
  check (grading_source in ('AUTO', 'AI', 'TEACHER', 'SELF'));

create table if not exists public.assessment_item_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_item_id uuid not null references public.assessment_items(id) on delete restrict,
  version_number integer not null,
  content_snapshot jsonb not null default '{}'::jsonb,
  scoring_snapshot jsonb not null default '{}'::jsonb,
  mapping_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (assessment_item_id, version_number)
);

alter table public.assessment_responses
  add column if not exists assessment_item_version_id uuid references public.assessment_item_versions(id) on delete restrict;

create index if not exists assessment_attempts_user_source_idx
  on public.assessment_attempts(user_id, source_type, quiz_id, lesson_activity_id, submitted_at desc);
create index if not exists assessment_attempts_legacy_attempt_idx
  on public.assessment_attempts(legacy_quiz_attempt_id);
create index if not exists assessment_attempts_quiz_idx
  on public.assessment_attempts(quiz_id);
create index if not exists assessment_attempts_lesson_activity_idx
  on public.assessment_attempts(lesson_activity_id);
create index if not exists assessment_attempts_status_idx
  on public.assessment_attempts(status, submitted_at desc);
create unique index if not exists assessment_attempts_submission_key_idx
  on public.assessment_attempts(user_id, submission_key)
  where submission_key is not null;
create index if not exists assessment_responses_attempt_idx
  on public.assessment_responses(attempt_id);
create index if not exists assessment_responses_item_submitted_idx
  on public.assessment_responses(assessment_item_id, submitted_at desc);
create index if not exists assessment_responses_version_idx
  on public.assessment_responses(assessment_item_version_id);
create index if not exists assessment_item_versions_item_idx
  on public.assessment_item_versions(assessment_item_id, version_number desc);
create index if not exists assessment_item_skills_skill_idx
  on public.assessment_item_skills(skill_id);
create index if not exists assessment_item_targets_target_idx
  on public.assessment_item_targets(learning_target_id);
create index if not exists assessment_item_course_outcomes_outcome_idx
  on public.assessment_item_course_outcomes(course_outcome_id);
create index if not exists assessment_item_course_outcomes_item_idx
  on public.assessment_item_course_outcomes(assessment_item_id);
create index if not exists course_lesson_outcome_mappings_outcome_idx
  on public.course_lesson_outcome_mappings(course_outcome_id);
create index if not exists course_lesson_outcome_mappings_lesson_outcome_idx
  on public.course_lesson_outcome_mappings(lesson_outcome_id);

create or replace function public.archive_assessment_items_for_deleted_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'quiz_questions' then
    update public.assessment_items
    set status = 'ARCHIVED',
        source_deleted_at = coalesce(source_deleted_at, now()),
        source_label_snapshot = coalesce(source_label_snapshot, prompt_snapshot),
        source_key_snapshot = coalesce(source_key_snapshot, source_item_key)
    where quiz_question_id = old.id;
  elsif tg_table_name = 'lesson_slide_activities' then
    update public.assessment_items
    set status = 'ARCHIVED',
        source_deleted_at = coalesce(source_deleted_at, now()),
        source_label_snapshot = coalesce(source_label_snapshot, prompt_snapshot),
        source_key_snapshot = coalesce(source_key_snapshot, source_item_key)
    where lesson_activity_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists archive_assessment_items_after_quiz_question_delete on public.quiz_questions;
create trigger archive_assessment_items_after_quiz_question_delete
before delete on public.quiz_questions
for each row execute function public.archive_assessment_items_for_deleted_source();

drop trigger if exists archive_assessment_items_after_lesson_activity_delete on public.lesson_slide_activities;
create trigger archive_assessment_items_after_lesson_activity_delete
before delete on public.lesson_slide_activities
for each row execute function public.archive_assessment_items_for_deleted_source();

alter table public.assessment_item_versions enable row level security;
drop policy if exists "Admins manage assessment item versions" on public.assessment_item_versions;
create policy "Admins manage assessment item versions"
on public.assessment_item_versions for all
using (public.is_admin()) with check (public.is_admin());

-- Normalized scores are written by trusted server actions, never directly by browsers.
drop policy if exists "Users insert own assessment attempts" on public.assessment_attempts;
drop policy if exists "Users insert own assessment responses" on public.assessment_responses;
