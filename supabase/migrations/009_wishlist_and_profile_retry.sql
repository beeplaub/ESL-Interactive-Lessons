alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists avatar_url text;

alter table public.quiz_questions
  add column if not exists description text;

alter table public.quiz_attempts
  add column if not exists time_taken_seconds integer;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Users upload own avatar" on storage.objects;
drop policy if exists "Users update own avatar" on storage.objects;
drop policy if exists "Public read avatars" on storage.objects;

create policy "Users upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Public read avatars"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wishlist_one_target check (
    (lesson_id is not null and quiz_id is null)
    or (lesson_id is null and quiz_id is not null)
  )
);

create unique index if not exists wishlist_items_user_lesson_idx
on public.wishlist_items(user_id, lesson_id)
where lesson_id is not null;

create unique index if not exists wishlist_items_user_quiz_idx
on public.wishlist_items(user_id, quiz_id)
where quiz_id is not null;

alter table public.wishlist_items enable row level security;

drop policy if exists "Users manage own wishlist" on public.wishlist_items;

create policy "Users manage own wishlist"
on public.wishlist_items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
