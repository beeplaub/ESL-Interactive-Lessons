create table if not exists public.quiz_leaderboard_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  points integer not null,
  reason text not null default 'QUIZ_COMPLETED',
  created_at timestamptz not null default now()
);

create index if not exists quiz_leaderboard_points_user_idx
on public.quiz_leaderboard_points(user_id, created_at desc);

create index if not exists quiz_leaderboard_points_quiz_idx
on public.quiz_leaderboard_points(quiz_id);

alter table public.quiz_leaderboard_points enable row level security;

drop policy if exists "leaderboard public read" on public.quiz_leaderboard_points;
create policy "leaderboard public read"
on public.quiz_leaderboard_points
for select
using (true);

drop policy if exists "leaderboard users insert own" on public.quiz_leaderboard_points;
create policy "leaderboard users insert own"
on public.quiz_leaderboard_points
for insert
with check (auth.uid() = user_id);

drop policy if exists "leaderboard admins manage" on public.quiz_leaderboard_points;
create policy "leaderboard admins manage"
on public.quiz_leaderboard_points
for all
using (public.is_admin())
with check (public.is_admin());
