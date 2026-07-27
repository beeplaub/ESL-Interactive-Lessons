-- Central, versioned BrenUp design settings. Only platform administrators may write.
create table if not exists public.platform_style_settings (
  id boolean primary key default true check (id),
  settings jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_style_settings enable row level security;

drop policy if exists "Platform admins manage style settings" on public.platform_style_settings;
create policy "Platform admins manage style settings"
  on public.platform_style_settings for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));

insert into public.platform_style_settings (id, settings)
values (true, jsonb_build_object(
  'brandPrimary', '#3e3a72',
  'action', '#ff7a59',
  'canvas', '#fcf8ff',
  'surface', '#ffffff',
  'surfaceMuted', '#f5f2fe',
  'text', '#1b1b23',
  'textMuted', '#6e6e85',
  'border', '#e4e4ee',
  'success', '#2fae7a',
  'danger', '#a7391e',
  'achievement', '#f2b705',
  'orgAccent', '#ff7a59',
  'learnerDensity', 'COMFORTABLE',
  'adminDensity', 'COMPACT',
  'radius', 'BALANCED'
)) on conflict (id) do nothing;

create table if not exists public.platform_style_revisions (
  id uuid primary key default gen_random_uuid(),
  revision integer not null,
  settings jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_style_revisions enable row level security;

drop policy if exists "Platform admins read style revisions" on public.platform_style_revisions;
create policy "Platform admins read style revisions"
  on public.platform_style_revisions for select to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()));
