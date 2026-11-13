create table if not exists public.speech_practice_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_type text not null check (prompt_type in ('SHADOWING', 'TONGUE_TWISTER')),
  title text not null check (length(trim(title)) between 1 and 140),
  text text not null check (length(trim(text)) between 1 and 5000),
  cefr_level text check (cefr_level is null or cefr_level in ('A1','A2','B1','B2','C1','C2')),
  target_sounds text[] not null default '{}',
  tags text[] not null default '{}',
  audio_variants jsonb not null default '{}'::jsonb check (jsonb_typeof(audio_variants) = 'object'),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists speech_practice_prompts_picker_idx
  on public.speech_practice_prompts (prompt_type, status, updated_at desc);

alter table public.speech_practice_prompts enable row level security;
revoke all on public.speech_practice_prompts from anon, authenticated;
grant all on public.speech_practice_prompts to service_role;
