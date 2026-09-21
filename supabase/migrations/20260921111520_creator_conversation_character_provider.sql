alter table public.creator_conversation_characters
  add column if not exists provider text not null default 'auto'
  check (provider in ('auto', 'kokoro', 'google'));
