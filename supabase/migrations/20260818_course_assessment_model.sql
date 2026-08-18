-- Additive course assessment controls. Existing OBE and assessment data remain valid.
alter table public.courses
  add column if not exists formative_weight numeric not null default 40
    check (formative_weight >= 0 and formative_weight <= 100),
  add column if not exists summative_weight numeric not null default 60
    check (summative_weight >= 0 and summative_weight <= 100);

alter table public.course_items
  add column if not exists assessment_type text not null default 'FORMATIVE'
    check (assessment_type in ('FORMATIVE', 'SUMMATIVE')),
  add column if not exists item_assessment_weight numeric not null default 1
    check (item_assessment_weight > 0),
  add column if not exists normalization_target numeric not null default 100
    check (normalization_target > 0);

create index if not exists course_items_assessment_type_idx
  on public.course_items(course_id, assessment_type, position);
