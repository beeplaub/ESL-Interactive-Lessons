alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_social_links_object_check;

alter table public.profiles
  add constraint profiles_social_links_object_check
  check (jsonb_typeof(social_links) = 'object');
