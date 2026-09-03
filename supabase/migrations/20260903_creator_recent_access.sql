create table if not exists public.creator_recent_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('COURSE', 'LESSON', 'QUIZ')),
  content_id uuid not null,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_type)
);

create index if not exists creator_recent_access_user_visited_idx
  on public.creator_recent_access(user_id, visited_at desc);

alter table public.creator_recent_access enable row level security;

drop policy if exists "Creators manage own recent access" on public.creator_recent_access;
create policy "Creators manage own recent access"
  on public.creator_recent_access
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.creator_recent_access to authenticated;
