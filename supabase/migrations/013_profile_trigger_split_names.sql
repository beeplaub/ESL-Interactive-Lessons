-- Migration 013: improve create_profile_for_new_user trigger
-- Reads first_name + last_name directly from metadata (email/password signup).
-- Falls back to splitting full_name only for providers like Google OAuth.
-- Keeps full_name, first_name, last_name all consistent from the very first insert.

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text;
  v_last_name  text;
  v_full_name  text;
  v_parts      text[];
begin
  -- Email/password signup sends first_name + last_name in metadata.
  v_first_name := trim(coalesce(new.raw_user_meta_data->>'first_name', ''));
  v_last_name  := trim(coalesce(new.raw_user_meta_data->>'last_name',  ''));

  -- Google OAuth (and other providers) send full_name/name only — split as fallback.
  if v_first_name = '' then
    v_full_name := trim(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ));
    if v_full_name <> '' then
      v_parts      := regexp_split_to_array(v_full_name, '\s+');
      v_first_name := v_parts[1];
      v_last_name  := array_to_string(v_parts[2:array_length(v_parts,1)], ' ');
    end if;
  end if;

  -- Derive full_name from the resolved parts.
  v_full_name := trim(concat_ws(' ', nullif(v_first_name, ''), nullif(v_last_name, '')));
  if v_full_name = '' then
    v_full_name := coalesce(new.email, 'Learner');
  end if;

  insert into public.profiles (id, full_name, first_name, last_name, role)
  values (
    new.id,
    v_full_name,
    nullif(v_first_name, ''),
    nullif(v_last_name,  ''),
    'LEARNER'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
