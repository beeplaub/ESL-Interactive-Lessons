-- Persist creator voice-generation defaults and their lock state per user.
-- This is intentionally separate from profiles so it remains a creator-tool
-- preference and does not affect learner or organization branding settings.
create table if not exists public.voice_generation_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'auto' check (provider in ('auto', 'kokoro', 'google')),
  language_code text not null default 'en-US',
  voice_name text not null default 'Aoede',
  style text not null default 'Natural',
  pace text not null default 'Natural',
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_generation_preferences_updated_idx
  on public.voice_generation_preferences(updated_at desc);

alter table public.voice_generation_preferences enable row level security;

drop policy if exists "Users manage own voice generation preferences" on public.voice_generation_preferences;
create policy "Users manage own voice generation preferences"
  on public.voice_generation_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists voice_generation_preferences_touch_updated_at on public.voice_generation_preferences;
create trigger voice_generation_preferences_touch_updated_at
  before update on public.voice_generation_preferences
  for each row execute function public.touch_updated_at();
