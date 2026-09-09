-- Keep old live-class records available for audit while removing them from active lists.
alter table public.live_sessions
  drop constraint if exists live_sessions_status_check;

alter table public.live_sessions
  add constraint live_sessions_status_check
  check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'));
