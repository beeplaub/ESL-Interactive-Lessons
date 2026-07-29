-- R2 media storage metadata.
-- This is additive and keeps all existing Supabase-hosted media working.

alter table public.media_assets
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists public_url text;

alter table public.media_assets
  drop constraint if exists media_assets_storage_provider_check;

alter table public.media_assets
  add constraint media_assets_storage_provider_check
  check (storage_provider in ('supabase', 'r2', 'external'));

update public.media_assets
set
  storage_provider = case
    when source = 'LINK' then 'external'
    else coalesce(nullif(storage_provider, ''), 'supabase')
  end,
  public_url = coalesce(public_url, url)
where public_url is null
   or storage_provider is null
   or storage_provider = '';

alter table public.narration_translation_cache
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists public_url text;

alter table public.narration_translation_cache
  drop constraint if exists narration_translation_cache_storage_provider_check;

alter table public.narration_translation_cache
  add constraint narration_translation_cache_storage_provider_check
  check (storage_provider in ('supabase', 'r2'));

update public.narration_translation_cache
set storage_provider = coalesce(nullif(storage_provider, ''), 'supabase')
where storage_provider is null
   or storage_provider = '';
