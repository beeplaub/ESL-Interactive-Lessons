-- AI Voiceover Studio: temporary previews, permanent media linkage, and audit history.
-- Additive only. Existing AI generations and media assets remain unchanged.

create table if not exists public.ai_voiceover_generations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PREVIEW'
    check (status in ('PREVIEW', 'SAVED', 'FAILED', 'EXPIRED')),
  title text,
  script text not null,
  request_hash text not null,
  language_code text not null default 'en-US',
  voice_name text not null,
  style text not null default 'Natural',
  pace text not null default 'Natural',
  model_used text not null,
  storage_provider text not null check (storage_provider in ('supabase', 'r2')),
  storage_bucket text not null,
  storage_path text not null,
  public_url text not null,
  mime_type text not null default 'audio/wav',
  file_size bigint not null default 0,
  duration_seconds numeric,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  expires_at timestamptz,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_voiceover_generations_creator_created_idx
  on public.ai_voiceover_generations (creator_id, created_at desc);
create index if not exists ai_voiceover_generations_hash_idx
  on public.ai_voiceover_generations (creator_id, request_hash, status);
create index if not exists ai_voiceover_generations_expiry_idx
  on public.ai_voiceover_generations (status, expires_at)
  where status = 'PREVIEW';

alter table public.ai_voiceover_generations enable row level security;

drop policy if exists "Creators read own voiceovers" on public.ai_voiceover_generations;
create policy "Creators read own voiceovers"
  on public.ai_voiceover_generations for select
  using (auth.uid() = creator_id or public.is_admin());

drop policy if exists "Creators create own voiceovers" on public.ai_voiceover_generations;
create policy "Creators create own voiceovers"
  on public.ai_voiceover_generations for insert
  with check (auth.uid() = creator_id or public.is_admin());

drop policy if exists "Creators update own voiceovers" on public.ai_voiceover_generations;
create policy "Creators update own voiceovers"
  on public.ai_voiceover_generations for update
  using (auth.uid() = creator_id or public.is_admin())
  with check (auth.uid() = creator_id or public.is_admin());

insert into public.ai_feature_flags (feature_key, enabled, allowed_roles)
values ('creator_voiceover', true, array['ADMIN']::text[])
on conflict (feature_key) do nothing;

