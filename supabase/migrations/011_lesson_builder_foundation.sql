alter table public.lessons
  add column if not exists subtitle text,
  add column if not exists category text,
  add column if not exists thumbnail_path text,
  add column if not exists cover_image_path text,
  add column if not exists duration_minutes integer,
  add column if not exists estimated_completion_minutes integer;
