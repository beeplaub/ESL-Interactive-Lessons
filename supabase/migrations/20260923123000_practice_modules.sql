create table if not exists public.practice_modules (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('GRAMMAR','VOCABULARY','READING','WRITING','LISTENING','SPEAKING')),
  level text not null default 'B1',
  access_type text not null default 'FREE' check (access_type in ('FREE','ENROLLED')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED')),
  content jsonb not null default '{"blocks":[],"activities":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists practice_modules_category_status_idx on public.practice_modules(category, status, updated_at desc);
alter table public.practice_modules enable row level security;

drop policy if exists "Staff manage practice modules" on public.practice_modules;
create policy "Staff manage practice modules" on public.practice_modules for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Learners read published practice modules" on public.practice_modules;
create policy "Learners read published practice modules" on public.practice_modules for select using (status = 'PUBLISHED');
