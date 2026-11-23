-- Keep one compact activity marker per learner and UTC calendar day. This
-- avoids re-reading multiple, growing history tables on every learner page.
create table if not exists public.learner_streak_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.learner_streak_days enable row level security;

revoke all on public.learner_streak_days from anon, authenticated;
grant select on public.learner_streak_days to authenticated;
grant all on public.learner_streak_days to service_role;

drop policy if exists "Learners read own streak days" on public.learner_streak_days;
create policy "Learners read own streak days"
  on public.learner_streak_days for select to authenticated
  using ((select auth.uid()) = user_id);

-- All persisted learning actions use this trigger to record a day without
-- adding another client round-trip to each submission flow.
create or replace function public.capture_learner_streak_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_user_id uuid;
  activity_at timestamptz;
begin
  if tg_table_name = 'assessment_attempts' then
    if new.status = 'VOID' then return new; end if;
    activity_user_id := new.user_id;
    activity_at := coalesce(new.submitted_at, new.completed_at, new.created_at);
  elsif tg_table_name = 'community_posts' or tg_table_name = 'community_replies' then
    activity_user_id := new.author_id;
    activity_at := new.created_at;
  elsif tg_table_name = 'writing_submissions' then
    activity_user_id := new.learner_id;
    activity_at := new.created_at;
  elsif tg_table_name = 'practice_tasks' then
    -- Count only personal tasks created by the learner, not teacher-assigned work.
    if new.class_id is not null or (new.created_by is not null and new.created_by <> new.learner_id) then return new; end if;
    activity_user_id := new.learner_id;
    activity_at := new.created_at;
  else
    return new;
  end if;

  if activity_user_id is not null and activity_at is not null then
    insert into public.learner_streak_days (user_id, activity_date)
    values (activity_user_id, (activity_at at time zone 'UTC')::date)
    on conflict (user_id, activity_date) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_learner_streak_day() from public;
revoke all on function public.capture_learner_streak_day() from anon, authenticated;

drop trigger if exists learner_streak_from_assessment on public.assessment_attempts;
create trigger learner_streak_from_assessment
  after insert on public.assessment_attempts
  for each row execute function public.capture_learner_streak_day();

drop trigger if exists learner_streak_from_community_post on public.community_posts;
create trigger learner_streak_from_community_post
  after insert on public.community_posts
  for each row execute function public.capture_learner_streak_day();

drop trigger if exists learner_streak_from_community_reply on public.community_replies;
create trigger learner_streak_from_community_reply
  after insert on public.community_replies
  for each row execute function public.capture_learner_streak_day();

drop trigger if exists learner_streak_from_writing_submission on public.writing_submissions;
create trigger learner_streak_from_writing_submission
  after insert on public.writing_submissions
  for each row execute function public.capture_learner_streak_day();

drop trigger if exists learner_streak_from_personal_task on public.practice_tasks;
create trigger learner_streak_from_personal_task
  after insert on public.practice_tasks
  for each row execute function public.capture_learner_streak_day();

-- Seed existing activity so learners keep their current streak and history.
insert into public.learner_streak_days (user_id, activity_date)
select activity.user_id, (activity.activity_at at time zone 'UTC')::date
from (
  select attempt.user_id, coalesce(attempt.submitted_at, attempt.completed_at, attempt.created_at) as activity_at
  from public.assessment_attempts as attempt
  where attempt.status <> 'VOID'
  union all
  select legacy.user_id, legacy.completed_at
  from public.quiz_attempts as legacy
  where legacy.completed_at is not null
    and not exists (
      select 1 from public.assessment_attempts as attempt
      where attempt.legacy_quiz_attempt_id = legacy.id
    )
  union all
  select post.author_id, post.created_at from public.community_posts as post
  union all
  select reply.author_id, reply.created_at from public.community_replies as reply
  union all
  select submission.learner_id, submission.created_at from public.writing_submissions as submission
  union all
  select task.learner_id, task.created_at
  from public.practice_tasks as task
  where task.class_id is null and (task.created_by is null or task.created_by = task.learner_id)
) as activity
where activity.user_id is not null and activity.activity_at is not null
on conflict (user_id, activity_date) do nothing;
