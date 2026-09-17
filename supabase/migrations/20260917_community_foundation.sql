-- BrenUp Community / Circles foundation.
-- Course enrollment is the source of truth for learner access.

create table if not exists public.community_circles (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'DISCUSSION' check (post_type in ('DISCUSSION','QUESTION','VOICE','CHALLENGE','PRACTICE')),
  title text not null check (char_length(title) between 1 and 160),
  body text,
  feedback_mode text not null default 'CONVERSATION' check (feedback_mode in ('CONVERSATION','WELCOME','CORRECT_ME')),
  lesson_id uuid references public.lessons(id) on delete set null,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN','REMOVED','LOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (body is not null or post_type = 'VOICE')
);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  reply_type text not null default 'TEXT' check (reply_type in ('TEXT','VOICE','FOLLOW_UP','SECOND_TAKE','REFLECTION')),
  body text,
  feedback_mode text not null default 'CONVERSATION' check (feedback_mode in ('CONVERSATION','WELCOME','CORRECT_ME')),
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (body is not null or reply_type <> 'TEXT')
);

create table if not exists public.community_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  provider text not null check (provider in ('r2','supabase','external')),
  bucket text,
  path text,
  public_url text,
  mime_type text not null,
  bytes bigint not null check (bytes > 0),
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DELETED','QUARANTINED')),
  retention_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((post_id is null) <> (reply_id is null))
);

create table if not exists public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('HELPFUL','ENCOURAGING')),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (reply_id is null)),
  unique(post_id, user_id, reaction_type),
  unique(reply_id, user_id, reaction_type)
);

create table if not exists public.community_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, post_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (reply_id is null))
);

create table if not exists public.community_practice_activities (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  title text not null,
  description text not null,
  activity_type text not null check (activity_type in ('VOICE_RELAY','LISTEN_REFLECT','REWRITE_TOGETHER','TWO_SIDES','HELP_SOMEONE')),
  cefr_level text,
  skill text not null,
  prompt text not null,
  follow_up_prompt text,
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.community_practice_activities(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN','WAITING_FOR_PARTNER','WAITING_FOR_RESPONSE','SECOND_TAKE_REQUIRED','COMPLETED','CANCELLED')),
  prompt_response_id uuid references public.community_replies(id) on delete set null,
  follow_up_response_id uuid references public.community_replies(id) on delete set null,
  second_take_response_id uuid references public.community_replies(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(activity_id, learner_id, started_at)
);

create table if not exists public.community_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_feedback_mode text not null default 'CONVERSATION' check (default_feedback_mode in ('CONVERSATION','WELCOME','CORRECT_ME')),
  availability text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  allow_voice_matching boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.community_circles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_media enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_saves enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_practice_activities enable row level security;
alter table public.community_practice_attempts enable row level security;
alter table public.community_preferences enable row level security;

create index if not exists community_posts_circle_created_idx on public.community_posts(circle_id, created_at desc);
create index if not exists community_replies_post_created_idx on public.community_replies(post_id, created_at);
create index if not exists community_media_retention_idx on public.community_media(retention_expires_at) where status = 'ACTIVE';
create index if not exists community_reports_status_created_idx on public.community_reports(status, created_at);
create index if not exists community_practice_circle_status_idx on public.community_practice_activities(circle_id, status);
create index if not exists community_attempts_learner_status_idx on public.community_practice_attempts(learner_id, status);

-- A learner's circle access is derived from ACTIVE/COMPLETED enrollment.
create policy "Enrolled learners read circles" on public.community_circles for select to authenticated
using (public.is_admin() or exists (select 1 from public.course_enrollments e where e.course_id = community_circles.course_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Admins manage circles" on public.community_circles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Enrolled learners read posts" on public.community_posts for select to authenticated
using (public.is_admin() or exists (select 1 from public.community_circles c join public.course_enrollments e on e.course_id = c.course_id where c.id = community_posts.circle_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Enrolled learners create posts" on public.community_posts for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.community_circles c join public.course_enrollments e on e.course_id = c.course_id where c.id = community_posts.circle_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Authors or admins update posts" on public.community_posts for update to authenticated using (author_id = (select auth.uid()) or public.is_admin()) with check (author_id = (select auth.uid()) or public.is_admin());

create policy "Enrolled learners read replies" on public.community_replies for select to authenticated using (public.is_admin() or exists (select 1 from public.community_posts p join public.community_circles c on c.id = p.circle_id join public.course_enrollments e on e.course_id = c.course_id where p.id = community_replies.post_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Enrolled learners create replies" on public.community_replies for insert to authenticated with check (author_id = (select auth.uid()) and exists (select 1 from public.community_posts p join public.community_circles c on c.id = p.circle_id join public.course_enrollments e on e.course_id = c.course_id where p.id = community_replies.post_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Authors or admins update replies" on public.community_replies for update to authenticated using (author_id = (select auth.uid()) or public.is_admin()) with check (author_id = (select auth.uid()) or public.is_admin());

create policy "Owners or enrolled learners read media" on public.community_media for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin() or exists (select 1 from public.community_posts p join public.community_circles c on c.id = p.circle_id join public.course_enrollments e on e.course_id = c.course_id where p.id = community_media.post_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')));
create policy "Owners create media" on public.community_media for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners or admins delete media" on public.community_media for update to authenticated using (owner_id = (select auth.uid()) or public.is_admin()) with check (owner_id = (select auth.uid()) or public.is_admin());

create policy "Learners manage own reactions" on public.community_reactions for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
create policy "Learners manage own saves" on public.community_saves for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
create policy "Learners create reports" on public.community_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Reporters or admins read reports" on public.community_reports for select to authenticated using (reporter_id = (select auth.uid()) or public.is_admin());
create policy "Admins resolve reports" on public.community_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Enrolled learners read published activities" on public.community_practice_activities for select to authenticated using (public.is_admin() or (status = 'PUBLISHED' and exists (select 1 from public.community_circles c join public.course_enrollments e on e.course_id = c.course_id where c.id = community_practice_activities.circle_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED'))));
create policy "Admins manage activities" on public.community_practice_activities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Learners manage own attempts" on public.community_practice_attempts for all to authenticated using (learner_id = (select auth.uid()) or partner_id = (select auth.uid()) or public.is_admin()) with check (learner_id = (select auth.uid()) or partner_id = (select auth.uid()) or public.is_admin());
create policy "Learners manage own preferences" on public.community_preferences for all to authenticated using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
