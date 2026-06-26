create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  slug text unique,
  description text,
  topic text,
  category text,
  level text default 'All Levels',
  thumbnail_path text,
  cover_image_path text,
  duration_minutes integer,
  estimated_completion_minutes integer,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_outcomes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null default 1,
  outcome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_faqs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null default 1,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null default 1,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  section_id uuid references public.course_sections(id) on delete cascade,
  position integer not null default 1,
  item_type text not null check (item_type in ('LESSON', 'QUIZ', 'LEVEL_TEST', 'RESOURCE', 'EXTERNAL_LINK')),
  lesson_id uuid references public.lessons(id) on delete set null,
  quiz_id uuid references public.quizzes(id) on delete set null,
  title text,
  description text,
  resource_url text,
  is_required boolean not null default true,
  is_free_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, course_id)
);

create table if not exists public.course_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  current_item_id uuid references public.course_items(id) on delete set null,
  completed_items integer not null default 0,
  total_items integer not null default 0,
  progress_percent integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, course_id)
);

create table if not exists public.course_item_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_item_id uuid not null references public.course_items(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, course_item_id)
);

alter table public.courses enable row level security;
alter table public.course_outcomes enable row level security;
alter table public.course_faqs enable row level security;
alter table public.course_sections enable row level security;
alter table public.course_items enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_progress enable row level security;
alter table public.course_item_progress enable row level security;

create index if not exists courses_status_created_at_idx on public.courses(status, created_at desc);
create index if not exists course_sections_course_position_idx on public.course_sections(course_id, position);
create index if not exists course_items_course_position_idx on public.course_items(course_id, position);
create index if not exists course_enrollments_user_idx on public.course_enrollments(user_id);
create index if not exists course_progress_user_idx on public.course_progress(user_id);

drop policy if exists "Published courses are readable" on public.courses;
create policy "Published courses are readable"
on public.courses for select
using (status = 'PUBLISHED' or public.is_admin());

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses"
on public.courses for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Published course content is readable" on public.course_outcomes;
create policy "Published course content is readable"
on public.course_outcomes for select
using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'PUBLISHED' or public.is_admin())));

drop policy if exists "Admins manage course outcomes" on public.course_outcomes;
create policy "Admins manage course outcomes"
on public.course_outcomes for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Published course faqs are readable" on public.course_faqs;
create policy "Published course faqs are readable"
on public.course_faqs for select
using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'PUBLISHED' or public.is_admin())));

drop policy if exists "Admins manage course faqs" on public.course_faqs;
create policy "Admins manage course faqs"
on public.course_faqs for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Published course sections are readable" on public.course_sections;
create policy "Published course sections are readable"
on public.course_sections for select
using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'PUBLISHED' or public.is_admin())));

drop policy if exists "Admins manage course sections" on public.course_sections;
create policy "Admins manage course sections"
on public.course_sections for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Published course items are readable" on public.course_items;
create policy "Published course items are readable"
on public.course_items for select
using (exists (select 1 from public.courses c where c.id = course_id and (c.status = 'PUBLISHED' or public.is_admin())));

drop policy if exists "Admins manage course items" on public.course_items;
create policy "Admins manage course items"
on public.course_items for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users read own enrollments" on public.course_enrollments;
create policy "Users read own enrollments"
on public.course_enrollments for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users enroll themselves" on public.course_enrollments;
create policy "Users enroll themselves"
on public.course_enrollments for insert
with check (user_id = auth.uid());

drop policy if exists "Admins manage enrollments" on public.course_enrollments;
create policy "Admins manage enrollments"
on public.course_enrollments for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users read own course progress" on public.course_progress;
create policy "Users read own course progress"
on public.course_progress for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users manage own course progress" on public.course_progress;
create policy "Users manage own course progress"
on public.course_progress for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own course item progress" on public.course_item_progress;
create policy "Users read own course item progress"
on public.course_item_progress for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users manage own course item progress" on public.course_item_progress;
create policy "Users manage own course item progress"
on public.course_item_progress for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
