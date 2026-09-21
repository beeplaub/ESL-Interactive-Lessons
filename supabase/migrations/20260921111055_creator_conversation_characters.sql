create table if not exists public.creator_conversation_characters (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  role text not null default '' check (char_length(role) <= 160),
  voice_name text not null check (char_length(voice_name) between 1 and 80),
  accent text not null default 'US' check (accent in ('US', 'UK')),
  style text not null default 'Natural' check (char_length(style) between 1 and 80),
  pace text not null default 'Natural' check (pace in ('Very slow', 'Slow', 'Natural', 'Brisk')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, name)
);

create index if not exists creator_conversation_characters_owner_updated_idx
  on public.creator_conversation_characters (creator_id, updated_at desc);

alter table public.creator_conversation_characters enable row level security;

drop policy if exists "Creators manage own saved conversation characters"
  on public.creator_conversation_characters;
create policy "Creators manage own saved conversation characters"
  on public.creator_conversation_characters
  for all
  to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);

grant select, insert, update, delete on public.creator_conversation_characters to authenticated;
