-- Session-specific evidence points back to the existing assessment attempt;
-- it never replaces lesson progress or the normalized OBE evidence model.
create table if not exists public.live_activity_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.lesson_slide_activities(id) on delete cascade,
  score numeric not null default 0,
  total numeric not null default 0,
  answers jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists live_activity_responses_session_idx on public.live_activity_responses(session_id, submitted_at desc);
create index if not exists live_activity_responses_activity_idx on public.live_activity_responses(session_id, activity_id, user_id);

alter table public.live_activity_responses enable row level security;

drop policy if exists "Live learners read own responses" on public.live_activity_responses;
create policy "Live learners read own responses" on public.live_activity_responses for select using (user_id = auth.uid());
drop policy if exists "Live learners record own responses" on public.live_activity_responses;
create policy "Live learners record own responses" on public.live_activity_responses for insert with check (user_id = auth.uid() and public.can_access_live_session(session_id));
drop policy if exists "Live teachers read responses" on public.live_activity_responses;
create policy "Live teachers read responses" on public.live_activity_responses for select using (public.is_live_session_teacher(session_id));
