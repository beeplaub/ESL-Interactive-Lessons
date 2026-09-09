alter table public.live_session_playlist_items
  add column if not exists slide_number integer;
