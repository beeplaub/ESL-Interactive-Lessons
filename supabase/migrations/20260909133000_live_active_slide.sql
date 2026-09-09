alter table public.live_sessions
  add column if not exists active_playlist_item_id uuid references public.live_session_playlist_items(id) on delete set null;
