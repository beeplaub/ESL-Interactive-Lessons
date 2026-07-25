-- Durable invitations for teacher onboarding. Invitations are created by a
-- platform admin through the server-side Supabase Admin API and accepted when
-- the invited person follows the Supabase invitation link.

create table if not exists public.teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_invitations_email_idx
  on public.teacher_invitations(lower(email));
create index if not exists teacher_invitations_pending_idx
  on public.teacher_invitations(created_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.teacher_invitations enable row level security;

drop policy if exists "Admins manage teacher invitations" on public.teacher_invitations;
create policy "Admins manage teacher invitations" on public.teacher_invitations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Invitees read their teacher invitation" on public.teacher_invitations;
create policy "Invitees read their teacher invitation" on public.teacher_invitations
  for select using (user_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_teacher_invitations_updated_at on public.teacher_invitations;
create trigger touch_teacher_invitations_updated_at
before update on public.teacher_invitations
for each row execute function public.touch_updated_at();
