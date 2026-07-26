-- BrenUp school commercial layer. Teacher subscriptions remain user-owned;
-- school subscriptions are owned by organizations so access survives staffing changes.

alter table public.subscription_plans
  add column if not exists audience text not null default 'TEACHER';

alter table public.subscription_plans
  drop constraint if exists subscription_plans_audience_check;
alter table public.subscription_plans
  add constraint subscription_plans_audience_check check (audience in ('TEACHER', 'SCHOOL', 'BOTH'));

alter table public.subscription_plans
  drop constraint if exists subscription_plans_plan_key_check;
alter table public.subscription_plans
  add constraint subscription_plans_plan_key_check check (plan_key in ('FREE', 'BASIC', 'STANDARD', 'ELITE', 'SCHOOL_STARTER', 'SCHOOL_PRO'));

update public.subscription_plans
set audience = 'TEACHER'
where plan_key in ('FREE', 'BASIC', 'STANDARD', 'ELITE');

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
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

create table if not exists public.organization_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, feature_key)
);

create index if not exists organization_subscriptions_plan_idx on public.organization_subscriptions(plan_id);
create index if not exists organization_entitlement_overrides_org_idx on public.organization_entitlement_overrides(organization_id);

alter table public.organization_subscriptions enable row level security;
alter table public.organization_entitlement_overrides enable row level security;

drop policy if exists "School leaders read organization subscriptions" on public.organization_subscriptions;
create policy "School leaders read organization subscriptions" on public.organization_subscriptions for select
using (
  public.is_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_subscriptions.organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER', 'SCHOOL_ADMIN')
  )
);

drop policy if exists "School leaders read organization overrides" on public.organization_entitlement_overrides;
create policy "School leaders read organization overrides" on public.organization_entitlement_overrides for select
using (
  public.is_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_entitlement_overrides.organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER', 'SCHOOL_ADMIN')
  )
);

drop policy if exists "Admins manage organization subscriptions" on public.organization_subscriptions;
create policy "Admins manage organization subscriptions" on public.organization_subscriptions for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage organization overrides" on public.organization_entitlement_overrides;
create policy "Admins manage organization overrides" on public.organization_entitlement_overrides for all
using (public.is_admin()) with check (public.is_admin());

insert into public.subscription_plans (plan_key, name, description, monthly_price, yearly_price, trial_days, is_active, position, audience)
values
  ('SCHOOL_STARTER', 'School Starter', 'A focused school workspace for classes, assignments, and progress visibility.', 0, 0, 0, true, 10, 'SCHOOL'),
  ('SCHOOL_PRO', 'School Pro', 'A full school workspace with flexible capacity, reporting, branding, and advanced support.', 0, 0, 0, true, 11, 'SCHOOL')
on conflict (plan_key) do update set audience = excluded.audience;

insert into public.plan_entitlements (plan_id, feature_key, is_enabled, limit_value)
select p.id, seed.feature_key, seed.is_enabled, seed.limit_value
from public.subscription_plans p
join (
  values
    ('FREE', 'SCHOOL_WORKSPACE', false, 0), ('FREE', 'SCHOOL_CLASSES', false, 0), ('FREE', 'SCHOOL_LEARNERS', false, 0), ('FREE', 'SCHOOL_TEACHERS', false, 0), ('FREE', 'SCHOOL_REPORTS', false, 0), ('FREE', 'SCHOOL_BRANDING', false, 0),
    ('BASIC', 'SCHOOL_WORKSPACE', false, 0), ('BASIC', 'SCHOOL_CLASSES', false, 0), ('BASIC', 'SCHOOL_LEARNERS', false, 0), ('BASIC', 'SCHOOL_TEACHERS', false, 0), ('BASIC', 'SCHOOL_REPORTS', false, 0), ('BASIC', 'SCHOOL_BRANDING', false, 0),
    ('STANDARD', 'SCHOOL_WORKSPACE', false, 0), ('STANDARD', 'SCHOOL_CLASSES', false, 0), ('STANDARD', 'SCHOOL_LEARNERS', false, 0), ('STANDARD', 'SCHOOL_TEACHERS', false, 0), ('STANDARD', 'SCHOOL_REPORTS', false, 0), ('STANDARD', 'SCHOOL_BRANDING', false, 0),
    ('ELITE', 'SCHOOL_WORKSPACE', false, 0), ('ELITE', 'SCHOOL_CLASSES', false, 0), ('ELITE', 'SCHOOL_LEARNERS', false, 0), ('ELITE', 'SCHOOL_TEACHERS', false, 0), ('ELITE', 'SCHOOL_REPORTS', false, 0), ('ELITE', 'SCHOOL_BRANDING', false, 0),
    ('SCHOOL_STARTER', 'SCHOOL_WORKSPACE', true, 1), ('SCHOOL_STARTER', 'SCHOOL_CLASSES', true, 10), ('SCHOOL_STARTER', 'SCHOOL_LEARNERS', true, 100), ('SCHOOL_STARTER', 'SCHOOL_TEACHERS', true, 10), ('SCHOOL_STARTER', 'SCHOOL_REPORTS', true, null), ('SCHOOL_STARTER', 'SCHOOL_BRANDING', false, 0),
    ('SCHOOL_PRO', 'SCHOOL_WORKSPACE', true, null), ('SCHOOL_PRO', 'SCHOOL_CLASSES', true, null), ('SCHOOL_PRO', 'SCHOOL_LEARNERS', true, null), ('SCHOOL_PRO', 'SCHOOL_TEACHERS', true, null), ('SCHOOL_PRO', 'SCHOOL_REPORTS', true, null), ('SCHOOL_PRO', 'SCHOOL_BRANDING', true, null)
) as seed(plan_key, feature_key, is_enabled, limit_value) on seed.plan_key = p.plan_key
on conflict (plan_id, feature_key) do nothing;
