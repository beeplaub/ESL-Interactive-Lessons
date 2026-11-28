create table if not exists public.course_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  resource_type text not null default 'UPLOAD' check (resource_type in ('UPLOAD', 'FILE_LINK', 'WEB_LINK')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null,
  file_size bigint not null default 0 check (file_size >= 0 and file_size <= 26214400),
  external_url text check (external_url is null or external_url ~ '^https://'),
  bucket text,
  path text,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_resources_bucket_path_unique unique (bucket, path),
  constraint course_resources_storage_target_check check (
    (resource_type = 'UPLOAD' and bucket is not null and path is not null and external_url is null and file_size > 0)
    or (resource_type in ('FILE_LINK', 'WEB_LINK') and bucket is null and path is null and external_url is not null and file_size = 0)
  )
);

create index if not exists course_resources_course_position_idx
  on public.course_resources(course_id, position, created_at);

alter table public.course_resources enable row level security;

drop policy if exists "Enrolled learners and course managers read resources" on public.course_resources;
create policy "Enrolled learners and course managers read resources"
  on public.course_resources for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.course_enrollments e
      where e.course_id = course_resources.course_id
        and e.user_id = (select auth.uid())
        and e.status in ('ACTIVE', 'COMPLETED')
    )
    or exists (
      select 1 from public.courses c
      where c.id = course_resources.course_id
        and (c.owner_id = (select auth.uid()) or c.created_by = (select auth.uid()))
    )
    or exists (
      select 1 from public.course_staff s
      where s.course_id = course_resources.course_id
        and s.user_id = (select auth.uid())
        and s.manage_curriculum
    )
  );

revoke all on public.course_resources from anon;
revoke insert, update, delete on public.course_resources from authenticated;
grant select on public.course_resources to authenticated;
