-- Ordered live-class playlist. Items point to canonical lesson slides or a
-- session-owned whiteboard page; lesson content is never copied.
create table if not exists public.live_session_playlist_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  position integer not null check (position >= 0),
  item_type text not null check (item_type in ('WHITEBOARD', 'LESSON_SLIDE')),
  lesson_id uuid references public.lessons(id) on delete set null,
  slide_id uuid references public.slides(id) on delete set null,
  title text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((item_type = 'WHITEBOARD' and lesson_id is null and slide_id is null)
      or (item_type = 'LESSON_SLIDE' and lesson_id is not null and slide_id is not null))
);
create unique index if not exists live_session_playlist_position_idx
  on public.live_session_playlist_items(session_id, position);
create index if not exists live_session_playlist_session_idx
  on public.live_session_playlist_items(session_id, position);
alter table public.live_session_playlist_items enable row level security;
drop policy if exists "Live participants read playlist" on public.live_session_playlist_items;
create policy "Live participants read playlist" on public.live_session_playlist_items
  for select using (public.can_access_live_session(session_id));
drop policy if exists "Live teachers manage playlist" on public.live_session_playlist_items;
create policy "Live teachers manage playlist" on public.live_session_playlist_items
  for all using (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.live_sessions s where s.id = session_id and s.teacher_id = auth.uid()));
