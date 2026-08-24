-- A slide may contain multiple activities. Archived activities must not
-- reserve the slide's activity slot or prevent a replacement from being added.
alter table if exists public.lesson_slide_activities
  drop constraint if exists lesson_slide_activities_lesson_id_slide_number_key;

drop index if exists public.lesson_slide_activities_lesson_id_slide_number_key;

create index if not exists lesson_slide_activities_lesson_slide_number_idx
  on public.lesson_slide_activities(lesson_id, slide_number);
