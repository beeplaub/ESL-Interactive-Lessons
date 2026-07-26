-- Per-participant live location for the teacher monitoring panel.
-- Nullable keeps attendance history from earlier sessions fully compatible.
alter table public.live_attendance
  add column if not exists current_slide_number integer;

create index if not exists live_attendance_session_slide_idx
  on public.live_attendance(session_id, current_slide_number);
