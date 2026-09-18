-- Automatically provision one learner circle for every published course.
create or replace function public.ensure_course_community_circle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'PUBLISHED' then
    insert into public.community_circles (course_id, title, description, created_by)
    values (new.id, new.title, 'Learner community for ' || new.title, new.created_by)
    on conflict (course_id) do update set title = excluded.title, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists courses_community_circle_trigger on public.courses;
create trigger courses_community_circle_trigger
after insert or update of status, title on public.courses
for each row execute function public.ensure_course_community_circle();

insert into public.community_circles (course_id, title, description, created_by)
select c.id, c.title, 'Learner community for ' || c.title, c.created_by
from public.courses c
where c.status = 'PUBLISHED'
on conflict (course_id) do update set title = excluded.title, updated_at = now();
