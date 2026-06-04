alter table public.slide_activities
add column if not exists lesson_id uuid references public.lessons(id) on delete cascade;

update public.slide_activities
set lesson_id = slides.lesson_id
from public.slides
where slide_activities.slide_id = slides.id
  and slide_activities.lesson_id is null;

alter table public.slide_activities
alter column lesson_id set not null;

create index if not exists slide_activities_lesson_idx on public.slide_activities(lesson_id);
