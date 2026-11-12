alter table public.profiles
  add column if not exists label text;

alter table public.profiles
  drop constraint if exists profiles_label_length_check;

alter table public.profiles
  add constraint profiles_label_length_check
  check (label is null or char_length(label) <= 60);
