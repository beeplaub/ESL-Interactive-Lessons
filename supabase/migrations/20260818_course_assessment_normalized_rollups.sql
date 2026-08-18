-- Preserve normalized assessment values without changing existing raw score columns.
alter table public.course_item_assessment_results
  add column if not exists normalized_score numeric not null default 0,
  add column if not exists normalization_target numeric not null default 100;
