create table if not exists public.live_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  name text not null,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(session_id, name)
);

create table if not exists public.live_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.live_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(group_id, user_id)
);

alter table public.live_messages
  add constraint live_messages_group_fk foreign key (group_id) references public.live_groups(id) on delete set null;

create index if not exists live_groups_session_idx on public.live_groups(session_id);
create index if not exists live_group_members_user_idx on public.live_group_members(user_id, group_id);
alter table public.live_groups enable row level security;
alter table public.live_group_members enable row level security;

drop policy if exists "Live participants read groups" on public.live_groups;
create policy "Live participants read groups" on public.live_groups for select using (public.can_access_live_session(session_id));
drop policy if exists "Live teachers manage groups" on public.live_groups;
create policy "Live teachers manage groups" on public.live_groups for all using (public.is_live_session_teacher(session_id)) with check (public.is_live_session_teacher(session_id));
drop policy if exists "Live participants read group members" on public.live_group_members;
create policy "Live participants read group members" on public.live_group_members for select using (exists (select 1 from public.live_groups g where g.id = group_id and public.can_access_live_session(g.session_id)));
drop policy if exists "Live teachers manage group members" on public.live_group_members;
create policy "Live teachers manage group members" on public.live_group_members for all using (exists (select 1 from public.live_groups g where g.id = group_id and public.is_live_session_teacher(g.session_id))) with check (exists (select 1 from public.live_groups g where g.id = group_id and public.is_live_session_teacher(g.session_id)));
