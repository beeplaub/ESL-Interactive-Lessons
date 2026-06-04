create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('ADMIN', 'LEARNER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lesson_status as enum ('DRAFT', 'PUBLISHED');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'LEARNER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text not null,
  level text not null default 'B1',
  description text,
  pdf_path text not null,
  status public.lesson_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_audio_files (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  label text not null,
  storage_path text not null,
  linked_slide_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide_number integer not null,
  title text not null,
  section_label text,
  raw_text text not null,
  type text not null default 'INFO',
  linked_answer_slide_id uuid references public.slides(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, slide_number)
);

create table if not exists public.slide_activities (
  id uuid primary key default gen_random_uuid(),
  slide_id uuid not null references public.slides(id) on delete cascade,
  activity_type text not null,
  prompt text not null,
  items jsonb not null default '{}'::jsonb,
  answer_key jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learner_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  current_slide_number integer not null default 1,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table if not exists public.learner_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide_id uuid not null references public.slides(id) on delete cascade,
  activity_id uuid not null references public.slide_activities(id) on delete cascade,
  response_data jsonb not null default '{}'::jsonb,
  is_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_status_idx on public.lessons(status);
create index if not exists slides_lesson_order_idx on public.slides(lesson_id, slide_number);
create index if not exists responses_user_lesson_idx on public.learner_responses(user_id, lesson_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists lessons_touch_updated_at on public.lessons;
create trigger lessons_touch_updated_at before update on public.lessons
for each row execute function public.touch_updated_at();

drop trigger if exists lesson_audio_files_touch_updated_at on public.lesson_audio_files;
create trigger lesson_audio_files_touch_updated_at before update on public.lesson_audio_files
for each row execute function public.touch_updated_at();

drop trigger if exists slides_touch_updated_at on public.slides;
create trigger slides_touch_updated_at before update on public.slides
for each row execute function public.touch_updated_at();

drop trigger if exists slide_activities_touch_updated_at on public.slide_activities;
create trigger slide_activities_touch_updated_at before update on public.slide_activities
for each row execute function public.touch_updated_at();

drop trigger if exists learner_progress_touch_updated_at on public.learner_progress;
create trigger learner_progress_touch_updated_at before update on public.learner_progress
for each row execute function public.touch_updated_at();

drop trigger if exists learner_responses_touch_updated_at on public.learner_responses;
create trigger learner_responses_touch_updated_at before update on public.learner_responses
for each row execute function public.touch_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'LEARNER')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_audio_files enable row level security;
alter table public.slides enable row level security;
alter table public.slide_activities enable row level security;
alter table public.learner_progress enable row level security;
alter table public.learner_responses enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "lessons read published or admin" on public.lessons;
create policy "lessons read published or admin" on public.lessons
for select using (status = 'PUBLISHED' or public.is_admin());

drop policy if exists "lessons admin write" on public.lessons;
create policy "lessons admin write" on public.lessons
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "slides read published or admin" on public.slides;
create policy "slides read published or admin" on public.slides
for select using (
  public.is_admin()
  or exists (
    select 1 from public.lessons
    where lessons.id = slides.lesson_id and lessons.status = 'PUBLISHED'
  )
);

drop policy if exists "slides admin write" on public.slides;
create policy "slides admin write" on public.slides
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "activities read published or admin" on public.slide_activities;
create policy "activities read published or admin" on public.slide_activities
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.slides
    join public.lessons on lessons.id = slides.lesson_id
    where slides.id = slide_activities.slide_id and lessons.status = 'PUBLISHED'
  )
);

drop policy if exists "activities admin write" on public.slide_activities;
create policy "activities admin write" on public.slide_activities
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "audio read published or admin" on public.lesson_audio_files;
create policy "audio read published or admin" on public.lesson_audio_files
for select using (
  public.is_admin()
  or exists (
    select 1 from public.lessons
    where lessons.id = lesson_audio_files.lesson_id and lessons.status = 'PUBLISHED'
  )
);

drop policy if exists "audio admin write" on public.lesson_audio_files;
create policy "audio admin write" on public.lesson_audio_files
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "progress own read" on public.learner_progress;
create policy "progress own read" on public.learner_progress
for select using (user_id = auth.uid());

drop policy if exists "progress own write" on public.learner_progress;
create policy "progress own write" on public.learner_progress
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "responses own read" on public.learner_responses;
create policy "responses own read" on public.learner_responses
for select using (user_id = auth.uid());

drop policy if exists "responses own write" on public.learner_responses;
create policy "responses own write" on public.learner_responses
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('lessons', 'lessons', false), ('lesson-audio', 'lesson-audio', false)
on conflict (id) do nothing;

drop policy if exists "lesson pdf admin write" on storage.objects;
create policy "lesson pdf admin write" on storage.objects
for all using (bucket_id = 'lessons' and public.is_admin())
with check (bucket_id = 'lessons' and public.is_admin());

drop policy if exists "lesson audio admin write" on storage.objects;
create policy "lesson audio admin write" on storage.objects
for all using (bucket_id = 'lesson-audio' and public.is_admin())
with check (bucket_id = 'lesson-audio' and public.is_admin());

drop policy if exists "lesson audio authenticated read" on storage.objects;
create policy "lesson audio authenticated read" on storage.objects
for select using (bucket_id in ('lesson-audio', 'lessons') and auth.role() = 'authenticated');
