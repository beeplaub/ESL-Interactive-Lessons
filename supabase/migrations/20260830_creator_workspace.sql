create table if not exists public.creator_projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text,
  category text not null default 'CONTENT' check (category in ('COURSE','LESSON','WORKSHEET','ASSESSMENT','AUDIO','RESEARCH','CONTENT','PERSONAL')),
  status text not null default 'ACTIVE' check (status in ('PLANNING','ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
  color text not null default 'purple',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tasks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.creator_projects(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text,
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','WAITING','COMPLETED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  label text,
  due_at timestamptz,
  related_url text,
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_notes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.creator_projects(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_resources (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.creator_projects(id) on delete set null,
  resource_type text not null default 'LINK' check (resource_type in ('LINK','CODE','FILE','AUDIO','BRENUP')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  value text not null,
  description text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_projects_creator_idx on public.creator_projects(creator_id, updated_at desc);
create index if not exists creator_tasks_creator_due_idx on public.creator_tasks(creator_id, status, due_at);
create index if not exists creator_tasks_project_idx on public.creator_tasks(project_id, position, created_at);
create index if not exists creator_notes_creator_idx on public.creator_notes(creator_id, updated_at desc);
create index if not exists creator_resources_creator_idx on public.creator_resources(creator_id, updated_at desc);

alter table public.creator_projects enable row level security;
alter table public.creator_tasks enable row level security;
alter table public.creator_notes enable row level security;
alter table public.creator_resources enable row level security;

drop policy if exists "Creators manage own workspace projects" on public.creator_projects;
create policy "Creators manage own workspace projects" on public.creator_projects for all to authenticated
using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);
drop policy if exists "Creators manage own workspace tasks" on public.creator_tasks;
create policy "Creators manage own workspace tasks" on public.creator_tasks for all to authenticated
using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);
drop policy if exists "Creators manage own workspace notes" on public.creator_notes;
create policy "Creators manage own workspace notes" on public.creator_notes for all to authenticated
using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);
drop policy if exists "Creators manage own workspace resources" on public.creator_resources;
create policy "Creators manage own workspace resources" on public.creator_resources for all to authenticated
using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);

grant select, insert, update, delete on public.creator_projects, public.creator_tasks, public.creator_notes, public.creator_resources to authenticated;
