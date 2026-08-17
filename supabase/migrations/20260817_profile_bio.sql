-- Optional profile bio; used for a public author card only when the user is a Journal author.
alter table public.profiles add column if not exists bio text;
