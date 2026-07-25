-- BrenUp commercial foundation: database-driven plans, subscriptions, limits,
-- and creator-specific overrides. This intentionally does not alter existing
-- course payments or enrollments.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique check (plan_key in ('FREE', 'BASIC', 'STANDARD', 'ELITE')),
  name text not null,
  description text,
  monthly_price numeric(10, 2) not null default 0 check (monthly_price >= 0),
  yearly_price numeric(10, 2) not null default 0 check (yearly_price >= 0),
  trial_days integer not null default 0 check (trial_days >= 0),
  is_active boolean not null default true,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, feature_key)
);

create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
  billing_interval text check (billing_interval in ('MONTHLY', 'YEARLY')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_subscription_id text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, feature_key)
);

create index if not exists creator_subscriptions_plan_idx on public.creator_subscriptions(plan_id);
create index if not exists plan_entitlements_plan_idx on public.plan_entitlements(plan_id);
create index if not exists creator_entitlement_overrides_user_idx on public.creator_entitlement_overrides(user_id);

alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.creator_subscriptions enable row level security;
alter table public.creator_entitlement_overrides enable row level security;

create policy "Active plans are readable" on public.subscription_plans
  for select using (is_active or public.is_admin());

create policy "Active plan entitlements are readable" on public.plan_entitlements
  for select using (
    public.is_admin() or exists (
      select 1 from public.subscription_plans p
      where p.id = plan_entitlements.plan_id and p.is_active
    )
  );

create policy "Users read own creator subscription" on public.creator_subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

create policy "Users read own entitlement overrides" on public.creator_entitlement_overrides
  for select using (user_id = auth.uid() or public.is_admin());

create policy "Admins manage subscription plans" on public.subscription_plans
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage plan entitlements" on public.plan_entitlements
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage creator subscriptions" on public.creator_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage creator entitlement overrides" on public.creator_entitlement_overrides
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.subscription_plans (plan_key, name, description, position)
values
  ('FREE', 'Free', 'Try BrenUp with a compact, branded mini-course.', 1),
  ('BASIC', 'Basic', 'Build one complete course with the full learning toolkit.', 2),
  ('STANDARD', 'Standard', 'Run up to five courses with learner AI support.', 3),
  ('ELITE', 'Elite', 'Unlimited publishing, creator AI, and future premium controls.', 4)
on conflict (plan_key) do nothing;

insert into public.plan_entitlements (plan_id, feature_key, is_enabled, limit_value)
select p.id, seed.feature_key, seed.is_enabled, seed.limit_value
from public.subscription_plans p
join (
  values
    ('FREE', 'COURSES', true, 1),
    ('FREE', 'LESSONS_PER_COURSE', true, 3),
    ('FREE', 'SLIDES_PER_LESSON', true, 12),
    ('FREE', 'QUIZZES', true, 3),
    ('FREE', 'STORAGE_MB', true, 100),
    ('FREE', 'AI_CREATOR', false, 0),
    ('FREE', 'AI_LEARNER', false, 0),
    ('FREE', 'CUSTOM_BRANDING', false, 0),
    ('BASIC', 'COURSES', true, 1),
    ('BASIC', 'LESSONS_PER_COURSE', true, null),
    ('BASIC', 'SLIDES_PER_LESSON', true, null),
    ('BASIC', 'QUIZZES', true, null),
    ('BASIC', 'STORAGE_MB', true, 1024),
    ('BASIC', 'AI_CREATOR', false, 0),
    ('BASIC', 'AI_LEARNER', false, 0),
    ('BASIC', 'CUSTOM_BRANDING', false, 0),
    ('STANDARD', 'COURSES', true, 5),
    ('STANDARD', 'LESSONS_PER_COURSE', true, null),
    ('STANDARD', 'SLIDES_PER_LESSON', true, null),
    ('STANDARD', 'QUIZZES', true, null),
    ('STANDARD', 'STORAGE_MB', true, 5120),
    ('STANDARD', 'AI_CREATOR', false, 0),
    ('STANDARD', 'AI_LEARNER', true, null),
    ('STANDARD', 'CUSTOM_BRANDING', false, 0),
    ('ELITE', 'COURSES', true, null),
    ('ELITE', 'LESSONS_PER_COURSE', true, null),
    ('ELITE', 'SLIDES_PER_LESSON', true, null),
    ('ELITE', 'QUIZZES', true, null),
    ('ELITE', 'STORAGE_MB', true, null),
    ('ELITE', 'AI_CREATOR', true, null),
    ('ELITE', 'AI_LEARNER', true, null),
    ('ELITE', 'CUSTOM_BRANDING', true, null)
) as seed(plan_key, feature_key, is_enabled, limit_value) on seed.plan_key = p.plan_key
on conflict (plan_id, feature_key) do nothing;
