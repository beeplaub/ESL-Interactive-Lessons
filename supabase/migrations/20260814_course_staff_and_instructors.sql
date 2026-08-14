-- Course-scoped staff roles and granular creator permissions.
-- Existing ownership, content, URLs, enrollment, and learner progress remain unchanged.

create table if not exists public.course_staff (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_role text not null default 'INSTRUCTOR'
    check (staff_role in ('COURSE_ADMIN', 'INSTRUCTOR', 'ASSISTANT')),
  is_primary boolean not null default false,
  show_to_learners boolean not null default true,
  display_order integer not null default 0,
  edit_course_details boolean not null default false,
  manage_curriculum boolean not null default false,
  create_content boolean not null default false,
  edit_assigned_content boolean not null default false,
  publish_content boolean not null default false,
  manage_enrollments boolean not null default false,
  grade_submissions boolean not null default false,
  view_analytics boolean not null default true,
  run_live_classes boolean not null default false,
  manage_course_staff boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create unique index if not exists course_staff_one_primary_idx
  on public.course_staff(course_id) where is_primary;
create index if not exists course_staff_user_idx on public.course_staff(user_id, course_id);
create index if not exists course_staff_public_idx
  on public.course_staff(course_id, display_order) where show_to_learners;

drop trigger if exists course_staff_touch_updated_at on public.course_staff;
create trigger course_staff_touch_updated_at before update on public.course_staff
for each row execute function public.touch_updated_at();

-- Every existing and future owner remains the course administrator. The row
-- may be hidden from learners when the owner is not also an instructor.
insert into public.course_staff (
  course_id, user_id, staff_role, is_primary, show_to_learners,
  edit_course_details, manage_curriculum, create_content,
  edit_assigned_content, publish_content, manage_enrollments,
  grade_submissions, view_analytics, run_live_classes,
  manage_course_staff, created_by
)
select
  c.id, coalesce(c.owner_id, c.created_by), 'COURSE_ADMIN', false, false,
  true, true, true, true, true, true, true, true, true, true,
  coalesce(c.owner_id, c.created_by)
from public.courses c
where coalesce(c.owner_id, c.created_by) is not null
on conflict (course_id, user_id) do nothing;

create or replace function public.can_manage_course_staff(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role::text = 'ADMIN'
    )
    or exists (
      select 1 from public.courses c
      where c.id = target_course_id
        and (c.owner_id = (select auth.uid()) or c.created_by = (select auth.uid()))
    )
    or exists (
      select 1 from public.course_staff cs
      where cs.course_id = target_course_id
        and cs.user_id = (select auth.uid())
        and cs.manage_course_staff
    );
$$;

alter table public.course_staff enable row level security;

drop policy if exists "Course staff can view relevant team rows" on public.course_staff;
create policy "Course staff can view relevant team rows"
on public.course_staff for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_course_staff(course_id)
);

drop policy if exists "Course managers can add team members" on public.course_staff;
create policy "Course managers can add team members"
on public.course_staff for insert to authenticated
with check (public.can_manage_course_staff(course_id));

drop policy if exists "Course managers can update team members" on public.course_staff;
create policy "Course managers can update team members"
on public.course_staff for update to authenticated
using (public.can_manage_course_staff(course_id))
with check (public.can_manage_course_staff(course_id));

drop policy if exists "Course managers can remove team members" on public.course_staff;
create policy "Course managers can remove team members"
on public.course_staff for delete to authenticated
using (public.can_manage_course_staff(course_id));

grant select on public.course_staff to authenticated;
grant insert, update, delete on public.course_staff to authenticated;
