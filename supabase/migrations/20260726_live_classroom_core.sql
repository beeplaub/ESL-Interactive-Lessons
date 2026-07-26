-- BrenUp Live Classroom foundation. Sessions wrap existing lesson/course content;
-- they do not duplicate the lesson player or learner-progress model.

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text,
  teacher_id uuid not null references auth.users(id) on delete restrict,
  scheduled_at timestamptz,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 480),
  external_meeting_url text,
  session_code text not null unique,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),
  started_at timestamptz,
  ended_at timestamptz,
  current_slide_number integer not null default 1,
  navigation_locked boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('TEACHER', 'STUDENT')),
  status text not null default 'INVITED' check (status in ('INVITED', 'JOINED', 'LEFT', 'REMOVED')),
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, user_id)
);

create table if not exists public.live_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_seconds integer not null default 0,
  unique(session_id, user_id)
);

create table if not exists public.live_activity_states (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  slide_id uuid references public.slides(id) on delete set null,
  activity_id uuid references public.lesson_slide_activities(id) on delete set null,
  state text not null default 'CLOSED' check (state in ('CLOSED', 'OPEN', 'REVEALED', 'RESET')),
  opens_at timestamptz,
  closes_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(session_id, activity_id)
);

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists live_sessions_class_idx on public.live_sessions(class_id, scheduled_at desc);
create index if not exists live_sessions_teacher_idx on public.live_sessions(teacher_id, scheduled_at desc);
create index if not exists live_session_members_user_idx on public.live_session_members(user_id, session_id);
create index if not exists live_attendance_session_idx on public.live_attendance(session_id, user_id);
create index if not exists live_events_session_idx on public.live_events(session_id, created_at desc);

alter table public.live_sessions enable row level security;
alter table public.live_session_members enable row level security;
alter table public.live_attendance enable row level security;
alter table public.live_activity_states enable row level security;
alter table public.live_events enable row level security;

create or replace function public.can_access_live_session(target_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.live_sessions s
    where s.id = target_session_id
      and (public.is_admin() or s.teacher_id = auth.uid() or exists (
        select 1 from public.class_members cm where cm.class_id = s.class_id and cm.user_id = auth.uid()
      ))
  );
$$;

drop policy if exists "Live participants read sessions" on public.live_sessions;
create policy "Live participants read sessions" on public.live_sessions for select using (public.can_access_live_session(id));
drop policy if exists "Live teachers manage sessions" on public.live_sessions;
create policy "Live teachers manage sessions" on public.live_sessions for all using (public.is_admin() or teacher_id = auth.uid()) with check (public.is_admin() or teacher_id = auth.uid());

drop policy if exists "Live participants read roster" on public.live_session_members;
create policy "Live participants read roster" on public.live_session_members for select using (public.can_access_live_session(session_id));
drop policy if exists "Live teachers manage roster" on public.live_session_members;
create policy "Live teachers manage roster" on public.live_session_members for all using (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid()));

drop policy if exists "Live users read own attendance" on public.live_attendance;
create policy "Live users read own attendance" on public.live_attendance for select using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid()));
drop policy if exists "Live users record own attendance" on public.live_attendance;
create policy "Live users record own attendance" on public.live_attendance for insert with check (user_id = auth.uid() and public.can_access_live_session(session_id));
drop policy if exists "Live users update own attendance" on public.live_attendance;
create policy "Live users update own attendance" on public.live_attendance for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Live participants read activity states" on public.live_activity_states;
create policy "Live participants read activity states" on public.live_activity_states for select using (public.can_access_live_session(session_id));
drop policy if exists "Live teachers manage activity states" on public.live_activity_states;
create policy "Live teachers manage activity states" on public.live_activity_states for all using (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid()));

drop policy if exists "Live participants read events" on public.live_events;
create policy "Live participants read events" on public.live_events for select using (public.can_access_live_session(session_id));
drop policy if exists "Live users record events" on public.live_events;
create policy "Live users record events" on public.live_events for insert with check (actor_id = auth.uid() and public.can_access_live_session(session_id));
