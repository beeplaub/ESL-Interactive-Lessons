-- BrenUp outcome-based education and language-profile foundation.
-- Non-destructive: existing lessons, quizzes, attempts, progress, and content remain intact.

alter table public.courses
  add column if not exists mastery_threshold numeric not null default 70
    check (mastery_threshold between 0 and 100),
  add column if not exists minimum_evidence_coverage numeric not null default 70
    check (minimum_evidence_coverage between 0 and 100),
  add column if not exists evidence_selection text not null default 'LATEST'
    check (evidence_selection in ('LATEST', 'BEST', 'FIRST'));

alter table public.course_outcomes
  add column if not exists code text,
  add column if not exists description text,
  add column if not exists weight numeric not null default 1 check (weight > 0),
  add column if not exists mastery_threshold_override numeric
    check (mastery_threshold_override is null or mastery_threshold_override between 0 and 100),
  add column if not exists evidence_selection_override text
    check (evidence_selection_override is null or evidence_selection_override in ('LATEST', 'BEST', 'FIRST')),
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ARCHIVED'));

with numbered as (
  select id, 'CO' || row_number() over (partition by course_id order by position, created_at, id) as generated_code
  from public.course_outcomes
)
update public.course_outcomes outcome
set code = numbered.generated_code
from numbered
where outcome.id = numbered.id and coalesce(outcome.code, '') = '';

alter table public.course_outcomes alter column code set not null;
create unique index if not exists course_outcomes_course_code_idx
  on public.course_outcomes(course_id, code);

alter table public.course_items
  add column if not exists assessment_weight numeric not null default 1 check (assessment_weight > 0),
  add column if not exists mastery_threshold_override numeric
    check (mastery_threshold_override is null or mastery_threshold_override between 0 and 100),
  add column if not exists evidence_selection_override text
    check (evidence_selection_override is null or evidence_selection_override in ('LATEST', 'BEST', 'FIRST'));

create table if not exists public.lesson_outcomes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  code text not null,
  outcome text not null,
  position integer not null default 1,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, code)
);

-- Preserve lessons.description and copy any existing JSON/newline outcomes into normalized rows.
do $$
declare
  lesson_row record;
  parsed jsonb;
  outcome_text text;
  outcome_position integer;
begin
  for lesson_row in
    select id, description
    from public.lessons
    where coalesce(description, '') <> ''
      and not exists (select 1 from public.lesson_outcomes lo where lo.lesson_id = lessons.id)
  loop
    outcome_position := 0;
    begin
      parsed := lesson_row.description::jsonb;
      if jsonb_typeof(parsed -> 'outcomes') = 'array' then
        for outcome_text in select jsonb_array_elements_text(parsed -> 'outcomes')
        loop
          if btrim(outcome_text) <> '' then
            outcome_position := outcome_position + 1;
            insert into public.lesson_outcomes (lesson_id, code, outcome, position)
            values (lesson_row.id, 'LO' || outcome_position, btrim(outcome_text), outcome_position);
          end if;
        end loop;
      end if;
    exception when others then
      for outcome_text in
        select btrim(regexp_replace(value, '^[-•]\s*', ''))
        from regexp_split_to_table(lesson_row.description, E'\r?\n') value
      loop
        if outcome_text <> '' then
          outcome_position := outcome_position + 1;
          insert into public.lesson_outcomes (lesson_id, code, outcome, position)
          values (lesson_row.id, 'LO' || outcome_position, outcome_text, outcome_position);
        end if;
      end loop;
    end;
  end loop;
end $$;

create table if not exists public.course_lesson_outcome_mappings (
  id uuid primary key default gen_random_uuid(),
  course_item_id uuid not null references public.course_items(id) on delete cascade,
  lesson_outcome_id uuid not null references public.lesson_outcomes(id) on delete cascade,
  course_outcome_id uuid not null references public.course_outcomes(id) on delete cascade,
  contribution_weight numeric not null default 1 check (contribution_weight > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_item_id, lesson_outcome_id)
);

create table if not exists public.learning_skills (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.learning_skills(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  position integer not null default 1,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.learning_skills (slug, name, position) values
  ('vocabulary', 'Vocabulary', 1),
  ('spelling', 'Spelling', 2),
  ('pronunciation', 'Pronunciation', 3),
  ('grammar', 'Grammar', 4),
  ('sentence-construction', 'Sentence construction', 5),
  ('reading-comprehension', 'Reading comprehension', 6),
  ('listening', 'Listening', 7),
  ('speaking', 'Speaking', 8),
  ('writing', 'Writing', 9),
  ('functional-language', 'Functional language', 10)
on conflict (slug) do update set name = excluded.name, position = excluded.position;

insert into public.learning_skills (parent_id, slug, name, position)
select parent.id, seed.slug, seed.name, seed.position
from (values
  ('grammar', 'grammar-tense-control', 'Tense control', 1),
  ('grammar', 'grammar-word-order', 'Word order', 2),
  ('vocabulary', 'vocabulary-meaning', 'Meaning and use', 1),
  ('vocabulary', 'vocabulary-collocation', 'Collocation', 2),
  ('pronunciation', 'pronunciation-word-sounds', 'Word sounds', 1),
  ('pronunciation', 'pronunciation-word-stress', 'Word stress', 2),
  ('reading-comprehension', 'reading-main-idea', 'Main idea', 1),
  ('reading-comprehension', 'reading-detail', 'Reading for detail', 2),
  ('reading-comprehension', 'reading-inference', 'Inference', 3),
  ('listening', 'listening-main-idea', 'Listening for gist', 1),
  ('listening', 'listening-detail', 'Listening for detail', 2),
  ('speaking', 'speaking-fluency', 'Fluency', 1),
  ('speaking', 'speaking-accuracy', 'Accuracy', 2),
  ('writing', 'writing-organisation', 'Organisation', 1),
  ('writing', 'writing-accuracy', 'Accuracy', 2),
  ('functional-language', 'functional-language-appropriacy', 'Appropriacy', 1)
) seed(parent_slug, slug, name, position)
join public.learning_skills parent on parent.slug = seed.parent_slug
on conflict (slug) do update
set parent_id = excluded.parent_id, name = excluded.name, position = excluded.position;

create table if not exists public.learning_targets (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in (
    'VOCABULARY', 'IDIOM', 'GRAMMAR', 'FUNCTIONAL_LANGUAGE', 'PRONUNCIATION', 'OTHER'
  )),
  label text not null,
  normalized_label text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, normalized_label)
);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('QUIZ_QUESTION', 'LESSON_ACTIVITY_QUESTION')),
  quiz_question_id uuid references public.quiz_questions(id) on delete cascade,
  lesson_activity_id uuid references public.lesson_slide_activities(id) on delete cascade,
  source_item_key text not null,
  lesson_outcome_id uuid references public.lesson_outcomes(id) on delete set null,
  prompt_snapshot text,
  max_points numeric not null default 1 check (max_points > 0),
  analytical_weight numeric not null default 1 check (analytical_weight > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'QUIZ_QUESTION' and quiz_question_id is not null and lesson_activity_id is null)
    or
    (source_type = 'LESSON_ACTIVITY_QUESTION' and lesson_activity_id is not null and quiz_question_id is null)
  )
);

create unique index if not exists assessment_items_quiz_question_idx
  on public.assessment_items(quiz_question_id)
  where quiz_question_id is not null;
create unique index if not exists assessment_items_lesson_question_idx
  on public.assessment_items(lesson_activity_id, source_item_key)
  where lesson_activity_id is not null;

create table if not exists public.assessment_item_skills (
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  skill_id uuid not null references public.learning_skills(id) on delete restrict,
  is_primary boolean not null default false,
  weight_percent numeric not null default 100 check (weight_percent > 0 and weight_percent <= 100),
  created_at timestamptz not null default now(),
  primary key (assessment_item_id, skill_id)
);

create unique index if not exists assessment_item_one_primary_skill_idx
  on public.assessment_item_skills(assessment_item_id)
  where is_primary;

create table if not exists public.assessment_item_targets (
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  learning_target_id uuid not null references public.learning_targets(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (assessment_item_id, learning_target_id)
);

create table if not exists public.assessment_item_course_outcomes (
  assessment_item_id uuid not null references public.assessment_items(id) on delete cascade,
  course_item_id uuid not null references public.course_items(id) on delete cascade,
  course_outcome_id uuid not null references public.course_outcomes(id) on delete cascade,
  contribution_weight numeric not null default 1 check (contribution_weight > 0),
  created_at timestamptz not null default now(),
  primary key (assessment_item_id, course_item_id, course_outcome_id)
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('QUIZ', 'LESSON_ACTIVITY')),
  quiz_id uuid references public.quizzes(id) on delete set null,
  lesson_activity_id uuid references public.lesson_slide_activities(id) on delete set null,
  course_item_id uuid references public.course_items(id) on delete set null,
  legacy_quiz_attempt_id uuid references public.quiz_attempts(id) on delete set null,
  attempt_number integer not null default 1,
  score numeric not null default 0,
  maximum_score numeric not null default 0,
  time_taken_seconds integer,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (source_type = 'QUIZ' and quiz_id is not null)
    or
    (source_type = 'LESSON_ACTIVITY' and lesson_activity_id is not null)
  )
);

create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  assessment_item_id uuid not null references public.assessment_items(id) on delete restrict,
  response_data jsonb,
  earned_points numeric not null default 0,
  maximum_points numeric not null default 1 check (maximum_points > 0),
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  unique (attempt_id, assessment_item_id)
);

create index if not exists lesson_outcomes_lesson_position_idx
  on public.lesson_outcomes(lesson_id, position);
create index if not exists course_lesson_outcome_mapping_item_idx
  on public.course_lesson_outcome_mappings(course_item_id);
create index if not exists assessment_attempts_user_completed_idx
  on public.assessment_attempts(user_id, completed_at desc);
create index if not exists assessment_attempts_course_item_idx
  on public.assessment_attempts(course_item_id, user_id);
create index if not exists assessment_responses_item_idx
  on public.assessment_responses(assessment_item_id, submitted_at desc);

alter table public.lesson_outcomes enable row level security;
alter table public.course_lesson_outcome_mappings enable row level security;
alter table public.learning_skills enable row level security;
alter table public.learning_targets enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_item_skills enable row level security;
alter table public.assessment_item_targets enable row level security;
alter table public.assessment_item_course_outcomes enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;

create policy "Published lesson outcomes are readable"
on public.lesson_outcomes for select
using (
  exists (
    select 1 from public.lessons
    where lessons.id = lesson_outcomes.lesson_id
      and (lessons.status = 'PUBLISHED' or public.is_admin())
  )
);
create policy "Admins manage lesson outcomes"
on public.lesson_outcomes for all
using (public.is_admin()) with check (public.is_admin());

create policy "Published course outcome mappings are readable"
on public.course_lesson_outcome_mappings for select
using (
  exists (
    select 1
    from public.course_items ci
    join public.courses c on c.id = ci.course_id
    where ci.id = course_lesson_outcome_mappings.course_item_id
      and (c.status = 'PUBLISHED' or public.is_admin())
  )
);
create policy "Admins manage course outcome mappings"
on public.course_lesson_outcome_mappings for all
using (public.is_admin()) with check (public.is_admin());

create policy "Active skills are readable"
on public.learning_skills for select
using (status = 'ACTIVE' or public.is_admin());
create policy "Admins manage skills"
on public.learning_skills for all
using (public.is_admin()) with check (public.is_admin());

create policy "Active learning targets are readable"
on public.learning_targets for select
using (status = 'ACTIVE' or public.is_admin());
create policy "Admins manage learning targets"
on public.learning_targets for all
using (public.is_admin()) with check (public.is_admin());

create policy "Published assessment items are readable"
on public.assessment_items for select
using (
  public.is_admin()
  or exists (
    select 1 from public.quiz_questions qq
    join public.quizzes q on q.id = qq.quiz_id
    where qq.id = assessment_items.quiz_question_id and q.status = 'PUBLISHED'
  )
  or exists (
    select 1 from public.lesson_slide_activities la
    join public.lessons l on l.id = la.lesson_id
    where la.id = assessment_items.lesson_activity_id and l.status = 'PUBLISHED'
  )
);
create policy "Admins manage assessment items"
on public.assessment_items for all
using (public.is_admin()) with check (public.is_admin());

create policy "Assessment skill mappings are readable"
on public.assessment_item_skills for select using (true);
create policy "Admins manage assessment skill mappings"
on public.assessment_item_skills for all
using (public.is_admin()) with check (public.is_admin());

create policy "Assessment target mappings are readable"
on public.assessment_item_targets for select using (true);
create policy "Admins manage assessment target mappings"
on public.assessment_item_targets for all
using (public.is_admin()) with check (public.is_admin());

create policy "Assessment outcome mappings are readable"
on public.assessment_item_course_outcomes for select using (true);
create policy "Admins manage assessment outcome mappings"
on public.assessment_item_course_outcomes for all
using (public.is_admin()) with check (public.is_admin());

create policy "Users read own assessment attempts"
on public.assessment_attempts for select
using ((select auth.uid()) = user_id or public.is_admin());
create policy "Users insert own assessment attempts"
on public.assessment_attempts for insert
with check ((select auth.uid()) = user_id);

create policy "Users read own assessment responses"
on public.assessment_responses for select
using (
  exists (
    select 1 from public.assessment_attempts attempt
    where attempt.id = assessment_responses.attempt_id
      and (attempt.user_id = (select auth.uid()) or public.is_admin())
  )
);
create policy "Users insert own assessment responses"
on public.assessment_responses for insert
with check (
  exists (
    select 1 from public.assessment_attempts attempt
    where attempt.id = assessment_responses.attempt_id
      and attempt.user_id = (select auth.uid())
  )
);

grant select on public.lesson_outcomes, public.course_lesson_outcome_mappings,
  public.learning_skills, public.learning_targets, public.assessment_items,
  public.assessment_item_skills, public.assessment_item_targets,
  public.assessment_item_course_outcomes to authenticated;
grant select, insert on public.assessment_attempts, public.assessment_responses to authenticated;

