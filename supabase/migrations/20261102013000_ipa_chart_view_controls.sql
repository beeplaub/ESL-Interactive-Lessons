create table if not exists public.ipa_chart_settings (
  id boolean primary key default true check (id),
  active_view text not null default 'A' check (active_view in ('A', 'B')),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ipa_chart_settings enable row level security;
revoke all on public.ipa_chart_settings from anon, authenticated;
grant all on public.ipa_chart_settings to service_role;

drop policy if exists "Platform admins manage IPA chart settings" on public.ipa_chart_settings;
create policy "Platform admins manage IPA chart settings"
  on public.ipa_chart_settings for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));

insert into public.ipa_chart_settings (id, active_view)
values (true, 'A')
on conflict (id) do nothing;

create table if not exists public.ipa_chart_view_history (
  id uuid primary key default gen_random_uuid(),
  revision integer not null unique check (revision > 0),
  active_view text not null check (active_view in ('A', 'B')),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ipa_chart_view_history enable row level security;
revoke all on public.ipa_chart_view_history from anon, authenticated;
grant all on public.ipa_chart_view_history to service_role;

drop policy if exists "Platform admins read IPA chart view history" on public.ipa_chart_view_history;
create policy "Platform admins read IPA chart view history"
  on public.ipa_chart_view_history for select to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()));

insert into public.ipa_chart_view_history (revision, active_view)
values (1, 'A')
on conflict (revision) do nothing;
