-- Configurable Level Test foundation.
-- Additive and backward-compatible with the original level_test_* tables.

create table if not exists public.level_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'BrenUp English Level Test',
  slug text not null unique default 'english-level-test',
  description text not null default '',
  instructions text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 60 and 14400),
  require_all_answers boolean not null default true,
  show_question_numbers boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.level_test_sections (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.level_tests(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 1,
  questions_to_draw integer not null default 0 check (questions_to_draw >= 0),
  randomize_questions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, position)
);

create table if not exists public.level_test_grade_bands (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.level_tests(id) on delete cascade,
  cefr_level text not null check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  label text not null,
  min_percentage numeric(5,2) not null check (min_percentage between 0 and 100),
  max_percentage numeric(5,2) not null check (max_percentage between 0 and 100),
  guidance_text text not null default '',
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, cefr_level),
  check (min_percentage <= max_percentage)
);

alter type public.level_test_question_type add value if not exists 'MULTIPLE_SELECT';
alter type public.level_test_question_type add value if not exists 'FILL';

alter table public.level_test_questions
  drop constraint if exists level_test_questions_correct_answer_check;

alter table public.level_test_questions
  add column if not exists test_id uuid references public.level_tests(id) on delete cascade,
  add column if not exists section_id uuid references public.level_test_sections(id) on delete set null,
  add column if not exists position integer not null default 1,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists options jsonb,
  add column if not exists correct_answers jsonb,
  add column if not exists explanation text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.reading_passages
  add column if not exists test_id uuid references public.level_tests(id) on delete cascade,
  add column if not exists section_id uuid references public.level_test_sections(id) on delete set null,
  add column if not exists position integer not null default 1,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists updated_at timestamptz not null default now();

alter table public.level_test_results
  add column if not exists test_id uuid references public.level_tests(id) on delete set null,
  add column if not exists total_questions integer,
  add column if not exists maximum_weighted_score numeric,
  add column if not exists percentage numeric(5,2),
  add column if not exists test_snapshot jsonb not null default '{}'::jsonb;

create index if not exists level_test_sections_test_position_idx
  on public.level_test_sections(test_id, position);
create index if not exists level_test_questions_test_section_idx
  on public.level_test_questions(test_id, section_id, position);
create index if not exists level_test_grade_bands_test_position_idx
  on public.level_test_grade_bands(test_id, position);
create index if not exists reading_passages_test_section_idx
  on public.reading_passages(test_id, section_id, position);

alter table public.level_tests enable row level security;
alter table public.level_test_sections enable row level security;
alter table public.level_test_grade_bands enable row level security;

drop policy if exists "published level tests readable" on public.level_tests;
create policy "published level tests readable"
on public.level_tests for select
using (status = 'PUBLISHED' or public.is_admin());

drop policy if exists "admins manage level tests" on public.level_tests;
create policy "admins manage level tests"
on public.level_tests for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "published level test sections readable" on public.level_test_sections;
create policy "published level test sections readable"
on public.level_test_sections for select
using (
  exists (
    select 1 from public.level_tests test
    where test.id = test_id and (test.status = 'PUBLISHED' or public.is_admin())
  )
);

drop policy if exists "admins manage level test sections" on public.level_test_sections;
create policy "admins manage level test sections"
on public.level_test_sections for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "published grade bands readable" on public.level_test_grade_bands;
create policy "published grade bands readable"
on public.level_test_grade_bands for select
using (
  exists (
    select 1 from public.level_tests test
    where test.id = test_id and (test.status = 'PUBLISHED' or public.is_admin())
  )
);

drop policy if exists "admins manage grade bands" on public.level_test_grade_bands;
create policy "admins manage grade bands"
on public.level_test_grade_bands for all
using (public.is_admin())
with check (public.is_admin());

-- Replace the legacy globally-readable bank policies with published-test-aware access.
drop policy if exists "questions readable" on public.level_test_questions;
create policy "published level test questions readable"
on public.level_test_questions for select
using (
  public.is_admin()
  or (
    status = 'ACTIVE'
    and test_id is not null
    and exists (
      select 1 from public.level_tests test
      where test.id = test_id and test.status = 'PUBLISHED'
    )
  )
);

drop policy if exists "admins manage level test questions" on public.level_test_questions;
create policy "admins manage level test questions"
on public.level_test_questions for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "passages readable" on public.reading_passages;
create policy "published reading passages readable"
on public.reading_passages for select
using (
  public.is_admin()
  or (
    status = 'ACTIVE'
    and test_id is not null
    and exists (
      select 1 from public.level_tests test
      where test.id = test_id and test.status = 'PUBLISHED'
    )
  )
);

drop policy if exists "admins manage reading passages" on public.reading_passages;
create policy "admins manage reading passages"
on public.reading_passages for all
using (public.is_admin())
with check (public.is_admin());

grant select on public.level_tests, public.level_test_sections,
  public.level_test_grade_bands, public.level_test_questions,
  public.reading_passages to authenticated;

-- Seed the editable default structure once. Questions can be imported from the admin UI.
insert into public.level_tests (
  title, slug, description, instructions, status, duration_seconds,
  require_all_answers, show_question_numbers
)
values (
  'BrenUp English Level Test',
  'english-level-test',
  'Find your current CEFR English level with a balanced adaptive-style assessment.',
  'Answer each question carefully. Your result is based on the weighted percentage across all sections.',
  'DRAFT',
  1800,
  true,
  true
)
on conflict (slug) do nothing;

insert into public.level_test_sections (test_id, title, description, position, questions_to_draw, randomize_questions)
select id, 'Use of English', 'Grammar, vocabulary, and language in use.', 1, 15, true
from public.level_tests where slug = 'english-level-test'
on conflict (test_id, position) do nothing;

insert into public.level_test_sections (test_id, title, description, position, questions_to_draw, randomize_questions)
select id, 'Reading', 'Read each passage and answer its questions.', 2, 10, true
from public.level_tests where slug = 'english-level-test'
on conflict (test_id, position) do nothing;

insert into public.level_test_grade_bands
  (test_id, cefr_level, label, min_percentage, max_percentage, guidance_text, position)
select test.id, band.cefr_level, band.label, band.minimum, band.maximum, card.guidance_text, band.position
from public.level_tests test
cross join (
  values
    ('A1', 'Beginner', 0::numeric, 19.99::numeric, 1),
    ('A2', 'Elementary', 20::numeric, 35.99::numeric, 2),
    ('B1', 'Intermediate', 36::numeric, 55.99::numeric, 3),
    ('B2', 'Upper-Intermediate', 56::numeric, 75.99::numeric, 4),
    ('C1', 'Advanced', 76::numeric, 91.99::numeric, 5),
    ('C2', 'Mastery', 92::numeric, 100::numeric, 6)
) as band(cefr_level, label, minimum, maximum, position)
left join public.level_test_result_cards card on card.cefr_level = band.cefr_level
where test.slug = 'english-level-test'
on conflict (test_id, cefr_level) do nothing;
