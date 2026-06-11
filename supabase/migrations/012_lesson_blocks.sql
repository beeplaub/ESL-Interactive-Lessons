create table if not exists public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide_id uuid not null references public.slides(id) on delete cascade,
  position integer not null,
  block_type text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slide_id, position)
);

create index if not exists lesson_blocks_lesson_idx on public.lesson_blocks(lesson_id);
create index if not exists lesson_blocks_slide_order_idx on public.lesson_blocks(slide_id, position);

drop trigger if exists lesson_blocks_touch_updated_at on public.lesson_blocks;
create trigger lesson_blocks_touch_updated_at before update on public.lesson_blocks
for each row execute function public.touch_updated_at();

alter table public.lesson_blocks enable row level security;

drop policy if exists "Admins manage lesson blocks" on public.lesson_blocks;
drop policy if exists "Learners read published lesson blocks" on public.lesson_blocks;

create policy "Admins manage lesson blocks"
on public.lesson_blocks
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Learners read published lesson blocks"
on public.lesson_blocks
for select
using (
  exists (
    select 1
    from public.lessons
    where lessons.id = lesson_blocks.lesson_id
      and lessons.status = 'PUBLISHED'
  )
);
