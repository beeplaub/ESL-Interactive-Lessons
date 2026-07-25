-- Durable learner notifications. Existing derived notification summaries can
-- continue to work until this migration is applied; these rows add proper
-- read/unread state for meaningful learner events.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  href text,
  tone text not null default 'purple' check (tone in ('purple', 'orange', 'green', 'blue')),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications(user_id, read_at)
  where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications" on public.user_notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users update own notifications" on public.user_notifications;
create policy "Users update own notifications" on public.user_notifications
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage notifications" on public.user_notifications;
create policy "Admins manage notifications" on public.user_notifications
  for all using (public.is_admin()) with check (public.is_admin());
