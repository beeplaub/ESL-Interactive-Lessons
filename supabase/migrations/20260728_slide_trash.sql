-- Keep lesson slides recoverable. This deliberately preserves blocks,
-- activities, learner attempts, and assessment evidence for a restored slide.
alter table public.slides
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists slides_active_lesson_position_idx
  on public.slides (lesson_id, slide_number)
  where deleted_at is null;

create index if not exists slides_lesson_trash_idx
  on public.slides (lesson_id, deleted_at desc)
  where deleted_at is not null;
