alter table public.quizzes
  add column if not exists timer_minutes integer check (timer_minutes is null or timer_minutes > 0);

alter table public.lessons
  add column if not exists timer_minutes integer check (timer_minutes is null or timer_minutes > 0);

alter table public.quiz_attempts
  add column if not exists time_taken_seconds integer;
