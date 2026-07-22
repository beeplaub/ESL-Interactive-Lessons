-- Create writing_submissions table for teacher grading queue
create table if not exists public.writing_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  activity_id text not null,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null,
  prompt text,
  submission_text text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'GRADED')),
  teacher_score numeric(5,2),
  teacher_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for quick lookup by teacher/admin and learner
create index if not exists writing_submissions_status_idx on public.writing_submissions(status, created_at desc);
create index if not exists writing_submissions_learner_idx on public.writing_submissions(learner_id);

-- Update quiz_questions check constraint to include all 8 writing types
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
    'MCQ', 'TRUE_FALSE', 'FILL', 'MATCHING', 'ERROR_CORRECTION', 'REORDERING', 'MULTIPLE_SELECT',
    'SHORT_ANSWER', 'DRAG_DROP', 'CATEGORIZATION', 'PRONUNCIATION', 'SUMMARIZATION', 'INFERENCE_DETECTION',
    'HEADINGS_MATCHING', 'SKIM_CHALLENGE', 'PARAPHRASE_ID',
    'DICTATION', 'LISTEN_AND_SELECT', 'SHADOWING', 'NOTE_TAKING_CHALLENGE', 'SOUND_DISCRIMINATION', 'LISTEN_AND_GAP_FILL',
    'SENTENCE_COMPLETION', 'ESSAY_WRITING', 'EMAIL_LETTER_WRITING', 'TRANSLATION', 'PARAPHRASE_PRACTICE', 'SENTENCE_COMBINING', 'CREATIVE_WRITING', 'PEER_REVIEW_EDITING'
  ));
