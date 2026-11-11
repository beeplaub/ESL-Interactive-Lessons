-- Additive lesson-template support. Existing lesson/slides/activity identifiers
-- stay untouched; every existing lesson remains LAP by default.

alter table public.lessons
  add column if not exists lesson_template text not null default 'LAP',
  add column if not exists autoplay_enabled boolean not null default false,
  add column if not exists autoplay_mode text not null default 'NARRATION_DURATION',
  add column if not exists autoplay_duration_seconds integer not null default 30;

alter table public.lessons drop constraint if exists lessons_lesson_template_check;
alter table public.lessons add constraint lessons_lesson_template_check
  check (lesson_template in ('LAP', 'LTP', 'LO', 'PO'));
alter table public.lessons drop constraint if exists lessons_autoplay_mode_check;
alter table public.lessons add constraint lessons_autoplay_mode_check
  check (autoplay_mode in ('FIXED_DURATION', 'NARRATION_DURATION'));
alter table public.lessons drop constraint if exists lessons_autoplay_duration_check;
alter table public.lessons add constraint lessons_autoplay_duration_check
  check (autoplay_duration_seconds between 5 and 600);
alter table public.lessons drop constraint if exists lessons_template_autoplay_check;
alter table public.lessons add constraint lessons_template_autoplay_check
  check (lesson_template in ('LTP', 'LO') or autoplay_enabled = false);

create table if not exists public.lesson_phase_items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide_id uuid not null references public.slides(id) on delete cascade,
  phase text not null check (phase in ('LEARN', 'PRACTICE')),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, slide_id, phase),
  unique (lesson_id, phase, position),
  unique (id, lesson_id)
);

create index if not exists lesson_phase_items_lesson_phase_order_idx
  on public.lesson_phase_items(lesson_id, phase, position);

drop trigger if exists lesson_phase_items_touch_updated_at on public.lesson_phase_items;
create trigger lesson_phase_items_touch_updated_at before update on public.lesson_phase_items
for each row execute function public.touch_updated_at();

create table if not exists public.lesson_practice_learn_links (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  practice_item_id uuid not null,
  learn_item_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (practice_item_id),
  foreign key (practice_item_id, lesson_id)
    references public.lesson_phase_items(id, lesson_id) on delete cascade,
  foreign key (learn_item_id, lesson_id)
    references public.lesson_phase_items(id, lesson_id) on delete cascade,
  check (practice_item_id <> learn_item_id)
);

alter table public.lesson_progress
  add column if not exists current_phase_item_id uuid null;
alter table public.lesson_progress drop constraint if exists lesson_progress_current_phase_item_id_fkey;
alter table public.lesson_progress add constraint lesson_progress_current_phase_item_id_fkey
  foreign key (current_phase_item_id) references public.lesson_phase_items(id) on delete set null;

create index if not exists lesson_practice_learn_links_learn_idx
  on public.lesson_practice_learn_links(lesson_id, learn_item_id);

create or replace function public.validate_lesson_practice_learn_link()
returns trigger language plpgsql set search_path = public as $$
declare
  practice_phase text;
  learn_phase text;
begin
  select phase into practice_phase from public.lesson_phase_items
    where id = new.practice_item_id and lesson_id = new.lesson_id;
  select phase into learn_phase from public.lesson_phase_items
    where id = new.learn_item_id and lesson_id = new.lesson_id;
  if practice_phase is distinct from 'PRACTICE' or learn_phase is distinct from 'LEARN' then
    raise exception 'Practice links must connect a Practice item to a Learn item in the same lesson';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_practice_learn_links_validate on public.lesson_practice_learn_links;
create trigger lesson_practice_learn_links_validate before insert or update on public.lesson_practice_learn_links
for each row execute function public.validate_lesson_practice_learn_link();

drop trigger if exists lesson_practice_learn_links_touch_updated_at on public.lesson_practice_learn_links;
create trigger lesson_practice_learn_links_touch_updated_at before update on public.lesson_practice_learn_links
for each row execute function public.touch_updated_at();

alter table public.lesson_phase_items enable row level security;
alter table public.lesson_practice_learn_links enable row level security;

drop policy if exists "Admins manage lesson phase items" on public.lesson_phase_items;
create policy "Admins manage lesson phase items" on public.lesson_phase_items
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Learners read published lesson phase items" on public.lesson_phase_items;
create policy "Learners read published lesson phase items" on public.lesson_phase_items
  for select using (exists (
    select 1 from public.lessons
    where lessons.id = lesson_phase_items.lesson_id and lessons.status = 'PUBLISHED'
  ));

drop policy if exists "Admins manage practice learn links" on public.lesson_practice_learn_links;
create policy "Admins manage practice learn links" on public.lesson_practice_learn_links
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Learners read published practice learn links" on public.lesson_practice_learn_links;
create policy "Learners read published practice learn links" on public.lesson_practice_learn_links
  for select using (exists (
    select 1 from public.lessons
    where lessons.id = lesson_practice_learn_links.lesson_id and lessons.status = 'PUBLISHED'
  ));

-- Backfill a presentation adapter for current visual slides. This does not
-- rewrite any authored content or change legacy LAP rendering.
with candidates as (
  select s.id as slide_id, s.lesson_id, 'LEARN'::text as phase, s.slide_number
  from public.slides s
  where s.deleted_at is null
    and exists (select 1 from public.lesson_blocks b where b.slide_id = s.id)
    and not exists (select 1 from public.lesson_phase_items i where i.lesson_id = s.lesson_id and i.slide_id = s.id and i.phase = 'LEARN')
  union all
  select s.id as slide_id, s.lesson_id, 'PRACTICE'::text as phase, s.slide_number
  from public.slides s
  where s.deleted_at is null
    and exists (select 1 from public.lesson_slide_activities a where a.slide_id = s.id and a.deleted_at is null)
    and not exists (select 1 from public.lesson_phase_items i where i.lesson_id = s.lesson_id and i.slide_id = s.id and i.phase = 'PRACTICE')
), ranked as (
  select c.*,
         row_number() over (partition by c.lesson_id, c.phase order by c.slide_number, c.slide_id) as row_offset,
         coalesce((select max(i.position) from public.lesson_phase_items i where i.lesson_id = c.lesson_id and i.phase = c.phase), 0) as existing_max
  from candidates c
)
insert into public.lesson_phase_items (lesson_id, slide_id, phase, position)
select lesson_id, slide_id, phase, existing_max + row_offset
from ranked
on conflict (lesson_id, slide_id, phase) do nothing;

insert into public.lesson_practice_learn_links (lesson_id, practice_item_id, learn_item_id)
select practice.lesson_id, practice.id, learn.id
from public.lesson_phase_items practice
join public.lesson_phase_items learn
  on learn.lesson_id = practice.lesson_id
 and learn.slide_id = practice.slide_id
 and learn.phase = 'LEARN'
where practice.phase = 'PRACTICE'
on conflict (practice_item_id) do nothing;
