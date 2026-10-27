alter table public.instant_live_state
  add column if not exists media_page integer not null default 1
  check (media_page between 1 and 10000);
