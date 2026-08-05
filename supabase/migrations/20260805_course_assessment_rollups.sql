-- Course-level assessment read models.
-- These are recalculated summaries; immutable question evidence remains in
-- assessment_attempts and assessment_responses.

create table if not exists public.course_assessment_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  score numeric not null default 0,
  maximum_score numeric not null default 0,
  score_percent numeric not null default 0 check (score_percent between 0 and 100),
  coverage_percent numeric not null default 0 check (coverage_percent between 0 and 100),
  completion_percent numeric not null default 0 check (completion_percent between 0 and 100),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED', 'PASSED', 'MASTERED', 'PENDING_REVIEW')),
  evidence_selection text not null default 'LATEST' check (evidence_selection in ('LATEST', 'BEST', 'FIRST')),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists public.course_item_assessment_results (
  id uuid primary key default gen_random_uuid(),
  course_assessment_result_id uuid not null references public.course_assessment_results(id) on delete cascade,
  course_item_id uuid not null references public.course_items(id) on delete cascade,
  title_snapshot text,
  score numeric not null default 0,
  maximum_score numeric not null default 0,
  score_percent numeric not null default 0 check (score_percent between 0 and 100),
  evidence_count integer not null default 0,
  completed boolean not null default false,
  calculated_at timestamptz not null default now(),
  unique (course_assessment_result_id, course_item_id)
);

create table if not exists public.course_outcome_assessment_results (
  id uuid primary key default gen_random_uuid(),
  course_assessment_result_id uuid not null references public.course_assessment_results(id) on delete cascade,
  course_outcome_id uuid not null references public.course_outcomes(id) on delete cascade,
  attainment_percent numeric not null default 0 check (attainment_percent between 0 and 100),
  coverage_percent numeric not null default 0 check (coverage_percent between 0 and 100),
  mapped_weight numeric not null default 0,
  evidence_count integer not null default 0,
  attained boolean not null default false,
  calculated_at timestamptz not null default now(),
  unique (course_assessment_result_id, course_outcome_id)
);

create index if not exists course_assessment_results_course_idx
  on public.course_assessment_results(course_id, updated_at desc);
create index if not exists course_assessment_results_user_idx
  on public.course_assessment_results(user_id, updated_at desc);
create index if not exists course_item_assessment_results_item_idx
  on public.course_item_assessment_results(course_item_id);
create index if not exists course_outcome_assessment_results_outcome_idx
  on public.course_outcome_assessment_results(course_outcome_id);

alter table public.course_assessment_results enable row level security;
alter table public.course_item_assessment_results enable row level security;
alter table public.course_outcome_assessment_results enable row level security;

drop policy if exists "Users read own course assessment results" on public.course_assessment_results;
create policy "Users read own course assessment results"
on public.course_assessment_results for select
using ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "Users read own course item assessment results" on public.course_item_assessment_results;
create policy "Users read own course item assessment results"
on public.course_item_assessment_results for select
using (exists (
  select 1 from public.course_assessment_results result
  where result.id = course_item_assessment_results.course_assessment_result_id
    and ((select auth.uid()) = result.user_id or public.is_admin())
));

drop policy if exists "Users read own course outcome assessment results" on public.course_outcome_assessment_results;
create policy "Users read own course outcome assessment results"
on public.course_outcome_assessment_results for select
using (exists (
  select 1 from public.course_assessment_results result
  where result.id = course_outcome_assessment_results.course_assessment_result_id
    and ((select auth.uid()) = result.user_id or public.is_admin())
));

grant select on public.course_assessment_results,
  public.course_item_assessment_results,
  public.course_outcome_assessment_results to authenticated;

