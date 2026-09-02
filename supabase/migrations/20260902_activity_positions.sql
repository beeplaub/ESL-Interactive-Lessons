alter table if exists public.lesson_slide_activities
  add column if not exists position integer;

with ranked as (
  select id,
         row_number() over (
           partition by slide_id
           order by created_at asc nulls first, id asc
         )::integer as next_position
  from public.lesson_slide_activities
  where slide_id is not null
)
update public.lesson_slide_activities activities
set position = ranked.next_position
from ranked
where activities.id = ranked.id
  and activities.position is null;

update public.lesson_slide_activities
set position = 1
where position is null;

alter table if exists public.lesson_slide_activities
  alter column position set default 1,
  alter column position set not null;

create or replace function public.assign_lesson_activity_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.position is null or new.position = 1 then
    select coalesce(max(position), 0) + 1
      into new.position
      from public.lesson_slide_activities
     where slide_id = new.slide_id
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_lesson_activity_position_before_insert on public.lesson_slide_activities;
create trigger assign_lesson_activity_position_before_insert
before insert on public.lesson_slide_activities
for each row execute function public.assign_lesson_activity_position();

create index if not exists lesson_slide_activities_slide_position_idx
  on public.lesson_slide_activities(slide_id, position);
