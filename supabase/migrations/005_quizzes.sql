create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text,
  level text check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_number integer not null,
  question_type text not null check (question_type in ('MCQ', 'TRUE_FALSE', 'FILL', 'MATCHING')),
  question_text text not null,
  options jsonb,
  correct_answer jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_order_idx
on public.quiz_questions(quiz_id, question_number);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;

drop policy if exists "quizzes published read" on public.quizzes;
create policy "quizzes published read" on public.quizzes
for select using (status = 'PUBLISHED' or public.is_admin());

drop policy if exists "quizzes admin write" on public.quizzes;
create policy "quizzes admin write" on public.quizzes
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz questions published read" on public.quiz_questions;
create policy "quiz questions published read" on public.quiz_questions
for select using (
  exists (
    select 1 from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
    and (quizzes.status = 'PUBLISHED' or public.is_admin())
  )
);

drop policy if exists "quiz questions admin write" on public.quiz_questions;
create policy "quiz questions admin write" on public.quiz_questions
for all using (public.is_admin()) with check (public.is_admin());
