-- Harden trigger and reporting functions against search_path hijacking.
-- Keep these functions schema-qualified (where applicable) and resolve
-- unqualified names from no implicit schema path.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'LEARNER');
  return new;
end;
$$;

create or replace function public.get_quiz_question_counts()
returns table(quiz_id uuid, question_count bigint)
language sql
security definer
set search_path = ''
as $$
  select quiz_id, count(*) as question_count
  from public.quiz_questions
  group by quiz_id;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
