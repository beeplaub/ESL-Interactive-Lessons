create extension if not exists "pgcrypto";

alter table public.lesson_progress
add column if not exists id uuid default gen_random_uuid(),
add column if not exists current_slide_number integer not null default 1,
add column if not exists completed boolean not null default false,
add column if not exists notes text not null default '',
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists lesson_progress_user_lesson_unique
on public.lesson_progress(user_id, lesson_id);
