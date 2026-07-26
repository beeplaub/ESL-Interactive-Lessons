-- BrenUp Live Classroom interaction layer.
-- This extends the session foundation without changing lessons or their player.

create table if not exists public.live_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete set null,
  group_id uuid,
  channel text not null default 'EVERYONE' check (channel in ('EVERYONE', 'GROUP', 'PRIVATE', 'TEACHER')),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.live_hand_raises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'HAND' check (kind in ('HAND', 'HELP')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(session_id, user_id, kind)
);

create table if not exists public.live_polls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  slide_id uuid references public.slides(id) on delete set null,
  question text not null,
  poll_type text not null check (poll_type in ('MCQ', 'TRUE_FALSE', 'WORD_CLOUD', 'EMOJI', 'RATING')),
  options jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'OPEN', 'CLOSED', 'REVEALED')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_poll_answers (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.live_polls(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(poll_id, user_id)
);

alter table public.live_messages enable row level security;
alter table public.live_hand_raises enable row level security;
alter table public.live_polls enable row level security;
alter table public.live_poll_answers enable row level security;

create index if not exists live_messages_session_idx on public.live_messages(session_id, created_at);
create index if not exists live_hand_raises_session_idx on public.live_hand_raises(session_id, resolved_at);
create index if not exists live_polls_session_idx on public.live_polls(session_id, created_at desc);
create index if not exists live_poll_answers_poll_idx on public.live_poll_answers(poll_id, user_id);

create or replace function public.is_live_session_teacher(target_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.live_sessions where id = target_session_id and teacher_id = auth.uid()
  );
$$;

drop policy if exists "Live participants read permitted messages" on public.live_messages;
create policy "Live participants read permitted messages" on public.live_messages for select using (
  public.can_access_live_session(session_id) and (
    channel in ('EVERYONE', 'GROUP') or sender_id = auth.uid() or recipient_id = auth.uid() or public.is_live_session_teacher(session_id)
  )
);
drop policy if exists "Live participants send messages" on public.live_messages;
create policy "Live participants send messages" on public.live_messages for insert with check (
  sender_id = auth.uid() and public.can_access_live_session(session_id) and
  (channel <> 'TEACHER' or recipient_id is not null)
);
drop policy if exists "Live teachers moderate messages" on public.live_messages;
create policy "Live teachers moderate messages" on public.live_messages for update using (public.is_live_session_teacher(session_id));

drop policy if exists "Live participants read hands" on public.live_hand_raises;
create policy "Live participants read hands" on public.live_hand_raises for select using (public.can_access_live_session(session_id));
drop policy if exists "Live learners raise hand" on public.live_hand_raises;
create policy "Live learners raise hand" on public.live_hand_raises for insert with check (user_id = auth.uid() and public.can_access_live_session(session_id));
drop policy if exists "Live learners lower own hand" on public.live_hand_raises;
create policy "Live learners lower own hand" on public.live_hand_raises for delete using (user_id = auth.uid());
drop policy if exists "Live teachers resolve hands" on public.live_hand_raises;
create policy "Live teachers resolve hands" on public.live_hand_raises for update using (public.is_live_session_teacher(session_id));

drop policy if exists "Live participants read polls" on public.live_polls;
create policy "Live participants read polls" on public.live_polls for select using (public.can_access_live_session(session_id));
drop policy if exists "Live teachers manage polls" on public.live_polls;
create policy "Live teachers manage polls" on public.live_polls for all using (public.is_live_session_teacher(session_id)) with check (public.is_live_session_teacher(session_id));

drop policy if exists "Live participants read poll answers" on public.live_poll_answers;
create policy "Live participants read poll answers" on public.live_poll_answers for select using (
  user_id = auth.uid() or public.is_live_session_teacher(session_id)
);
drop policy if exists "Live participants answer open polls" on public.live_poll_answers;
create policy "Live participants answer open polls" on public.live_poll_answers for insert with check (
  user_id = auth.uid() and public.can_access_live_session(session_id) and exists (
    select 1 from public.live_polls where id = poll_id and status = 'OPEN'
  )
);
drop policy if exists "Live participants update own poll answer" on public.live_poll_answers;
create policy "Live participants update own poll answer" on public.live_poll_answers for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime publication is idempotent when the tables are already present.
do $$ begin
  alter publication supabase_realtime add table public.live_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_hand_raises;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_polls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_poll_answers;
exception when duplicate_object then null; end $$;
