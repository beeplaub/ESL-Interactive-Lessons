create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
  );
$$;

create table if not exists public.lesson_slide_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide_id uuid references public.slides(id) on delete cascade,
  slide_number integer not null,
  activity_type text not null,
  activity_data jsonb,
  needs_review boolean not null default false,
  raw_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, slide_number)
);

alter table public.lesson_slide_activities enable row level security;

drop policy if exists "Admins manage lesson slide activities" on public.lesson_slide_activities;
drop policy if exists "Learners read published lesson slide activities" on public.lesson_slide_activities;

create policy "Admins manage lesson slide activities"
on public.lesson_slide_activities
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Learners read published lesson slide activities"
on public.lesson_slide_activities
for select
using (
  exists (
    select 1
    from public.lessons
    where lessons.id = lesson_slide_activities.lesson_id
      and lessons.status = 'PUBLISHED'
  )
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  score integer not null,
  total integer not null,
  answers jsonb,
  completed_at timestamptz not null default now()
);

alter table public.quiz_attempts enable row level security;

drop policy if exists "Users read own quiz attempts" on public.quiz_attempts;
drop policy if exists "Users insert own quiz attempts" on public.quiz_attempts;
drop policy if exists "Admins read all quiz attempts" on public.quiz_attempts;

create policy "Users read own quiz attempts"
on public.quiz_attempts
for select
using (auth.uid() = user_id);

create policy "Users insert own quiz attempts"
on public.quiz_attempts
for insert
with check (auth.uid() = user_id);

create policy "Admins read all quiz attempts"
on public.quiz_attempts
for select
using (public.is_admin());

alter table public.quiz_attempts
  alter column quiz_id drop not null;

alter table public.quiz_attempts
  add column if not exists lesson_slide_activity_id uuid references public.lesson_slide_activities(id) on delete cascade;

create index if not exists lesson_slide_activities_lesson_slide_idx
on public.lesson_slide_activities(lesson_id, slide_number);

create index if not exists quiz_attempts_lesson_slide_activity_idx
on public.quiz_attempts(lesson_slide_activity_id);
