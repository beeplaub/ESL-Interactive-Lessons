-- 028_add_inference_detection_type.sql
--
-- 1) Adds the new INFERENCE_DETECTION quiz question type.
-- 2) Fixes a pre-existing gap: the live quiz_questions_question_type_check
--    constraint was missing SUMMARIZATION and CATEGORIZATION even though
--    027_add_summarization_type.sql was written to add SUMMARIZATION and
--    the app code has fully supported both for a while. This migration
--    re-adds them defensively so the constraint matches what the app
--    actually writes.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'quiz_questions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%question_type%'
  loop
    execute format('alter table public.quiz_questions drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.quiz_questions
  add constraint quiz_questions_question_type_check
  check (question_type in (
    'MCQ',
    'TRUE_FALSE',
    'FILL',
    'MATCHING',
    'ERROR_CORRECTION',
    'REORDERING',
    'MULTIPLE_SELECT',
    'SHORT_ANSWER',
    'DRAG_DROP',
    'CATEGORIZATION',
    'PRONUNCIATION',
    'SUMMARIZATION',
    'INFERENCE_DETECTION'
  ));
