alter table public.profiles
  add column if not exists saved_block_background_colors jsonb not null default '[]'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_saved_block_background_colors_array_check;

alter table public.profiles
  add constraint profiles_saved_block_background_colors_array_check
  check (jsonb_typeof(saved_block_background_colors) = 'array');
