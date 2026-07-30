alter table public.course_items
  add column if not exists bypass_sequential_unlock boolean not null default false;

comment on column public.course_items.bypass_sequential_unlock is
  'When true, enrolled learners may open this course item even if previous course items are not completed.';
