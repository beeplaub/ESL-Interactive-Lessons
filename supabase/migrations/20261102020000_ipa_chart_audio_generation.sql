create table if not exists public.ipa_chart_audio_settings (
  accent text primary key check (accent in ('uk', 'us')),
  voice_name text not null default 'Aoede',
  style text not null default 'Natural',
  pace text not null default 'Natural',
  settings_revision integer not null default 1 check (settings_revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ipa_chart_audio_settings enable row level security;
revoke all on public.ipa_chart_audio_settings from anon, authenticated;
grant all on public.ipa_chart_audio_settings to service_role;

drop policy if exists "Platform admins manage IPA chart audio settings" on public.ipa_chart_audio_settings;
create policy "Platform admins manage IPA chart audio settings"
  on public.ipa_chart_audio_settings for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));

insert into public.ipa_chart_audio_settings (accent) values ('uk'), ('us')
on conflict (accent) do nothing;

create table if not exists public.ipa_chart_audio_assets (
  id uuid primary key default gen_random_uuid(),
  accent text not null check (accent in ('uk', 'us')),
  sound_id text not null,
  asset_type text not null check (asset_type in ('sound', 'word')),
  word text not null default '',
  status text not null default 'MISSING' check (status in ('MISSING', 'READY_FOR_REVIEW', 'APPROVED', 'FAILED')),
  live_public_url text,
  live_storage_provider text check (live_storage_provider is null or live_storage_provider in ('r2', 'supabase')),
  live_storage_bucket text,
  live_storage_path text,
  pending_public_url text,
  pending_storage_provider text check (pending_storage_provider is null or pending_storage_provider in ('r2', 'supabase')),
  pending_storage_bucket text,
  pending_storage_path text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  voice_name text,
  style text,
  pace text,
  settings_revision integer,
  generation_model text,
  generated_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accent, sound_id, asset_type, word),
  check ((asset_type = 'sound' and word = '') or (asset_type = 'word' and length(word) > 0))
);

create index if not exists ipa_chart_audio_assets_accent_status_idx
  on public.ipa_chart_audio_assets (accent, status);

alter table public.ipa_chart_audio_assets enable row level security;
revoke all on public.ipa_chart_audio_assets from anon, authenticated;
grant all on public.ipa_chart_audio_assets to service_role;

drop policy if exists "Platform admins manage IPA chart audio assets" on public.ipa_chart_audio_assets;
create policy "Platform admins manage IPA chart audio assets"
  on public.ipa_chart_audio_assets for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));
