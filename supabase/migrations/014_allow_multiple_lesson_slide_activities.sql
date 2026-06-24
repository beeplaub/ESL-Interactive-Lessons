alter table if exists public.lesson_slide_activities
  drop constraint if exists lesson_slide_activities_lesson_id_slide_number_key;

create index if not exists lesson_slide_activities_lesson_slide_number_idx
on public.lesson_slide_activities(lesson_id, slide_number);

create index if not exists lesson_slide_activities_slide_id_idx
on public.lesson_slide_activities(slide_id);
