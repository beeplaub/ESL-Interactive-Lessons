create table public.creator_agent_projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_agent_project_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creator_agent_projects(id) on delete cascade,
 name text not null, content text not null, version integer not null default 1, enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,name)
);
alter table public.creator_agent_projects enable row level security; alter table public.creator_agent_project_files enable row level security;
revoke all on public.creator_agent_projects, public.creator_agent_project_files from anon, authenticated;
grant select on public.creator_agent_projects, public.creator_agent_project_files to authenticated; grant all on public.creator_agent_projects, public.creator_agent_project_files to service_role;
create policy creator_projects_admin_read on public.creator_agent_projects for select to authenticated using (user_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN'));
create policy creator_project_files_admin_read on public.creator_agent_project_files for select to authenticated using (exists(select 1 from public.creator_agent_projects p join public.profiles pr on pr.id=auth.uid() where p.id=project_id and p.user_id=auth.uid() and pr.role='ADMIN'));
alter table public.creator_agent_sessions add column if not exists project_id uuid references public.creator_agent_projects(id) on delete set null;
create index creator_agent_projects_owner on public.creator_agent_projects(user_id,updated_at desc);
create index creator_agent_project_files_project on public.creator_agent_project_files(project_id,updated_at desc);
