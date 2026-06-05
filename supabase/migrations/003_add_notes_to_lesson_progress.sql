alter table public.lesson_progress
add column if not exists notes text not null default '';
