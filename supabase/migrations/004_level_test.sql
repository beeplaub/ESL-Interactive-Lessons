do $$ begin
  create type public.cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.level_test_section as enum ('USE_OF_ENGLISH', 'READING');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.level_test_question_type as enum ('MCQ', 'TRUE_FALSE');
exception when duplicate_object then null;
end $$;

alter table public.profiles
add column if not exists cefr_level public.cefr_level;

create table if not exists public.reading_passages (
  id uuid primary key default gen_random_uuid(),
  cefr_band text not null check (cefr_band in ('A1_B1', 'B2_C2')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.level_test_questions (
  id uuid primary key default gen_random_uuid(),
  section public.level_test_section not null,
  cefr_band public.cefr_level not null,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  question_type public.level_test_question_type not null default 'MCQ',
  reading_passage_id uuid references public.reading_passages(id) on delete cascade,
  weight numeric not null default 1.0,
  created_at timestamptz not null default now()
);

create table if not exists public.level_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_score integer not null,
  weighted_score numeric not null,
  cefr_level public.cefr_level not null,
  section_scores jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  time_taken_seconds integer not null default 0
);

create index if not exists level_test_results_user_completed_idx
on public.level_test_results(user_id, completed_at desc);

alter table public.reading_passages enable row level security;
alter table public.level_test_questions enable row level security;
alter table public.level_test_results enable row level security;

drop policy if exists "passages readable" on public.reading_passages;
create policy "passages readable" on public.reading_passages for select using (true);

drop policy if exists "questions readable" on public.level_test_questions;
create policy "questions readable" on public.level_test_questions for select using (true);

drop policy if exists "results own read" on public.level_test_results;
create policy "results own read" on public.level_test_results for select using (auth.uid() = user_id);
