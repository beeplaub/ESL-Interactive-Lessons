-- Guardian access is intentionally one-to-one: a guardian may see one learner,
-- and never gains staff, organization, or class-management privileges.

create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null unique references auth.users(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(guardian_id, learner_id)
);

create table if not exists public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(learner_id, email)
);

create index if not exists guardian_links_learner_idx on public.guardian_links(learner_id);
create index if not exists guardian_invitations_org_idx on public.guardian_invitations(organization_id, created_at desc);

alter table public.guardian_links enable row level security;
alter table public.guardian_invitations enable row level security;

drop policy if exists "Guardians read own learner link" on public.guardian_links;
create policy "Guardians read own learner link" on public.guardian_links for select
using (guardian_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage guardian links" on public.guardian_links;
create policy "Admins manage guardian links" on public.guardian_links for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage guardian invitations" on public.guardian_invitations;
create policy "Admins manage guardian invitations" on public.guardian_invitations for all
using (public.is_admin()) with check (public.is_admin());
