alter type public.user_role add value if not exists 'TEACHER';
alter type public.user_role add value if not exists 'SCHOOL_ADMIN';

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'MEMBER')),
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  level text,
  teacher_id uuid references auth.users(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'STUDENT' check (role in ('TEACHER', 'STUDENT')),
  joined_at timestamptz not null default now(),
  unique(class_id, user_id)
);

create table if not exists public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  item_type text not null check (item_type in ('COURSE', 'LESSON', 'QUIZ', 'LEVEL_TEST')),
  course_id uuid references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  title text,
  due_at timestamptz,
  required_score integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.courses
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

update public.courses
set owner_id = coalesce(owner_id, created_by)
where owner_id is null;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_assignments enable row level security;

create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists classes_org_idx on public.classes(organization_id);
create index if not exists class_members_user_idx on public.class_members(user_id);
create index if not exists class_assignments_class_idx on public.class_assignments(class_id);
create index if not exists courses_owner_idx on public.courses(owner_id);
create index if not exists courses_org_idx on public.courses(organization_id);

drop policy if exists "Admins manage organizations" on public.organizations;
create policy "Admins manage organizations" on public.organizations for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Members read organizations" on public.organizations;
create policy "Members read organizations" on public.organizations for select
using (
  public.is_admin()
  or exists (
    select 1 from public.organization_members m
    where m.organization_id = id and m.user_id = auth.uid()
  )
);

drop policy if exists "Admins manage organization members" on public.organization_members;
create policy "Admins manage organization members" on public.organization_members for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Members read own organization membership" on public.organization_members;
create policy "Members read own organization membership" on public.organization_members for select
using (public.is_admin() or user_id = auth.uid());

drop policy if exists "Admins manage classes" on public.classes;
create policy "Admins manage classes" on public.classes for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Class members read classes" on public.classes;
create policy "Class members read classes" on public.classes for select
using (
  public.is_admin()
  or teacher_id = auth.uid()
  or exists (
    select 1 from public.class_members m
    where m.class_id = id and m.user_id = auth.uid()
  )
);

drop policy if exists "Admins manage class members" on public.class_members;
create policy "Admins manage class members" on public.class_members for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users read own class membership" on public.class_members;
create policy "Users read own class membership" on public.class_members for select
using (public.is_admin() or user_id = auth.uid());

drop policy if exists "Admins manage class assignments" on public.class_assignments;
create policy "Admins manage class assignments" on public.class_assignments for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Class members read assignments" on public.class_assignments;
create policy "Class members read assignments" on public.class_assignments for select
using (
  public.is_admin()
  or exists (
    select 1 from public.class_members m
    where m.class_id = public.class_assignments.class_id and m.user_id = auth.uid()
  )
);
