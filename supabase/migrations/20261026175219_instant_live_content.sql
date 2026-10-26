-- Additive: no lesson, quiz, placement, or existing attempt records are changed.
alter table public.instant_live_state add column if not exists content jsonb;
alter table public.instant_live_state drop constraint if exists instant_live_state_stage_check;
alter table public.instant_live_state add constraint instant_live_state_stage_check
  check (stage in ('whiteboard','screen','camera','image','content'));
create table if not exists public.instant_live_responses (
  room_id uuid not null references public.instant_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer jsonb not null,
  score numeric,
  total numeric,
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id,question_id)
);
alter table public.instant_live_responses enable row level security;
revoke all on public.instant_live_responses from anon, authenticated;
grant all on public.instant_live_responses to service_role;
-- Access is exclusively through roomAccess-authorized API routes; learners can
-- write/read only their own answers and teachers receive aggregates, not profiles.
create table if not exists public.instant_live_activity_responses (
  room_id uuid not null references public.instant_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.lesson_slide_activities(id) on delete cascade,
  answers jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id,activity_id)
);
alter table public.instant_live_activity_responses enable row level security;
revoke all on public.instant_live_activity_responses from anon, authenticated;
grant all on public.instant_live_activity_responses to service_role;
