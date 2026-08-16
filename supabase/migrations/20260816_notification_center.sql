-- BrenUp Notification Center
-- This migration extends the existing user_notifications inbox without
-- removing historical notifications or changing existing event producers.

alter table public.user_notifications
  add column if not exists campaign_id uuid,
  add column if not exists category text not null default 'LEARNING',
  add column if not exists action_label text,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists expires_at timestamptz;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  detail text,
  action_label text,
  href text,
  tone text not null default 'purple' check (tone in ('purple', 'orange', 'green', 'blue')),
  category text not null default 'ANNOUNCEMENT',
  audience_type text not null check (audience_type in ('ALL_USERS', 'ROLE', 'ORGANIZATION', 'CLASS', 'COURSE', 'USERS')),
  audience jsonb not null default '{}'::jsonb,
  channels jsonb not null default '["IN_APP"]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  channel text not null check (channel in ('IN_APP', 'PUSH', 'EMAIL')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED')),
  provider text,
  provider_message_id text,
  error_message text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, channel)
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(user_id, category)
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'ANNOUNCEMENT',
  title_template text not null,
  detail_template text,
  action_label text,
  href_template text,
  tone text not null default 'purple' check (tone in ('purple', 'orange', 'green', 'blue')),
  channels jsonb not null default '["IN_APP"]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.notification_event_settings (
  event_type text primary key,
  enabled boolean not null default true,
  category text not null,
  default_channels jsonb not null default '["IN_APP"]'::jsonb,
  essential boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'WEB',
  user_agent text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_notifications_campaign_id_fkey'
      and conrelid = 'public.user_notifications'::regclass
  ) then
    alter table public.user_notifications
      add constraint user_notifications_campaign_id_fkey
      foreign key (campaign_id) references public.notification_campaigns(id) on delete set null;
  end if;
end $$;

create index if not exists notification_campaigns_status_schedule_idx
  on public.notification_campaigns(status, scheduled_at);
create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries(notification_id, status);
create index if not exists notification_preferences_user_idx
  on public.notification_preferences(user_id, category);
create index if not exists push_devices_user_enabled_idx
  on public.push_devices(user_id, enabled) where enabled = true;
create index if not exists user_notifications_active_idx
  on public.user_notifications(user_id, created_at desc) where archived_at is null;

alter table public.notification_campaigns enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_event_settings enable row level security;
alter table public.push_devices enable row level security;

drop policy if exists "Users read own notification deliveries" on public.notification_deliveries;
create policy "Users read own notification deliveries" on public.notification_deliveries for select
using (exists (select 1 from public.user_notifications n where n.id = notification_id and n.user_id = auth.uid()));

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences" on public.notification_preferences for all
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own push devices" on public.push_devices;
create policy "Users manage own push devices" on public.push_devices for all
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Admins manage notification campaigns" on public.notification_campaigns;
create policy "Admins manage notification campaigns" on public.notification_campaigns for all
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins read notification deliveries" on public.notification_deliveries;
create policy "Admins read notification deliveries" on public.notification_deliveries for select
using (public.is_admin());
drop policy if exists "Admins manage notification templates" on public.notification_templates;
create policy "Admins manage notification templates" on public.notification_templates for all
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage notification event settings" on public.notification_event_settings;
create policy "Admins manage notification event settings" on public.notification_event_settings for all
using (public.is_admin()) with check (public.is_admin());

insert into public.notification_event_settings (event_type, category, default_channels, essential)
values
  ('CLASS_ASSIGNMENT', 'ASSIGNMENTS', '["IN_APP","PUSH"]'::jsonb, false),
  ('COURSE_COMPLETED', 'ACHIEVEMENTS', '["IN_APP","PUSH"]'::jsonb, false),
  ('WRITING_GRADED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('ORDER_CONFIRMED', 'ACCOUNT', '["IN_APP","EMAIL"]'::jsonb, true),
  ('LIVE_CLASS_SCHEDULED', 'LIVE_CLASSES', '["IN_APP","PUSH"]'::jsonb, false),
  ('LIVE_CLASS_STARTED', 'LIVE_CLASSES', '["IN_APP","PUSH"]'::jsonb, false),
  ('LIVE_CLASS_CANCELLED', 'LIVE_CLASSES', '["IN_APP","PUSH"]'::jsonb, false),
  ('LIVE_CLASS_REMINDER', 'LIVE_CLASSES', '["IN_APP","PUSH"]'::jsonb, false),
  ('DUE_REMINDER', 'ASSIGNMENTS', '["IN_APP","PUSH"]'::jsonb, false),
  ('COURSE_ENROLLED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('COURSE_PUBLISHED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('LESSON_PUBLISHED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('QUIZ_PUBLISHED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('BADGE_UNLOCKED', 'ACHIEVEMENTS', '["IN_APP","PUSH"]'::jsonb, false),
  ('LEVEL_CHANGED', 'LEARNING', '["IN_APP","PUSH"]'::jsonb, false),
  ('SUPPORT_REPLY', 'SUPPORT', '["IN_APP","EMAIL"]'::jsonb, true),
  ('SECURITY', 'ACCOUNT', '["IN_APP","EMAIL"]'::jsonb, true)
on conflict (event_type) do nothing;

insert into public.notification_templates (name, category, title_template, detail_template, action_label, href_template, tone, channels)
values
  ('Course update', 'LEARNING', '{{course_title}} has an update', '{{message}}', 'Open course', '/courses/{{course_id}}', 'purple', '["IN_APP","PUSH"]'::jsonb),
  ('Class reminder', 'ASSIGNMENTS', '{{class_name}} reminder', '{{message}}', 'Open assignments', '/assignments', 'blue', '["IN_APP","PUSH"]'::jsonb),
  ('Platform announcement', 'ANNOUNCEMENT', '{{title}}', '{{message}}', 'Open BrenUp', '/account', 'orange', '["IN_APP"]'::jsonb)
on conflict (name) do nothing;
