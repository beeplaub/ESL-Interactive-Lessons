-- Durable heartbeat for the external notification scheduler.
create table if not exists public.notification_scheduler_health (
  scheduler_name text primary key,
  last_seen_at timestamptz not null default now(),
  last_status text not null default 'OK',
  last_error text,
  last_processed integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.notification_scheduler_health enable row level security;

drop policy if exists "Admins read notification scheduler health" on public.notification_scheduler_health;
create policy "Admins read notification scheduler health"
  on public.notification_scheduler_health for select
  using (public.is_admin());

create index if not exists notification_scheduler_health_seen_idx
  on public.notification_scheduler_health(last_seen_at desc);
