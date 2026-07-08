-- migration: 025_ai_integration_core.sql
-- Description: AI Core schema including prompt templates, feature flags, usage event logging, drafts, and AI roleplay session tracking.

-- 1. Feature flags
create table if not exists public.ai_feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text unique not null,
  enabled boolean not null default true,
  allowed_roles text[] not null default '{"ADMIN"}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_feature_flags enable row level security;

create policy "Admins manage AI feature flags"
  on public.ai_feature_flags for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "All authenticated users read AI feature flags"
  on public.ai_feature_flags for select
  using (auth.uid() is not null);

-- 2. Prompt templates
create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text unique not null,
  role_description text not null,
  prompt_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_prompt_templates enable row level security;

create policy "Admins manage prompt templates"
  on public.ai_prompt_templates for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "All authenticated users read prompt templates"
  on public.ai_prompt_templates for select
  using (auth.uid() is not null);

-- 3. Saved drafts (Creator workflow previews)
create table if not exists public.ai_saved_drafts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  draft_type text not null, -- 'COURSE' | 'LESSON' | 'QUIZ'
  draft_metadata jsonb not null default '{}'::jsonb,
  draft_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_saved_drafts enable row level security;

create policy "Admins and creators manage saved drafts"
  on public.ai_saved_drafts for all
  using (auth.uid() = creator_id or public.is_admin())
  with check (auth.uid() = creator_id or public.is_admin());

-- 4. Record of all generations
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_role text not null,
  feature_key text not null,
  model_used text not null,
  prompt_raw text,
  response_preview text,
  token_estimate integer,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.ai_generations enable row level security;

create policy "Users read own AI generations"
  on public.ai_generations for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users create own AI generations"
  on public.ai_generations for insert
  with check (auth.uid() = user_id or public.is_admin());

-- 5. Usage quota limits
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  request_date date not null default current_date,
  request_count integer not null default 1,
  estimated_tokens integer not null default 0,
  unique (user_id, feature_key, request_date)
);

alter table public.ai_usage_events enable row level security;

create policy "Users manage own AI usage"
  on public.ai_usage_events for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- 6. Roleplay sessions
create table if not exists public.ai_roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_activity_id uuid not null references public.lesson_slide_activities(id) on delete cascade,
  scenario_context text not null,
  cefr_level text not null,
  status text not null default 'IN_PROGRESS', -- 'IN_PROGRESS' | 'COMPLETED'
  scorecard jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_roleplay_sessions enable row level security;

create policy "Users read own roleplay sessions"
  on public.ai_roleplay_sessions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users manage own roleplay sessions"
  on public.ai_roleplay_sessions for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- 7. Roleplay messages
create table if not exists public.ai_roleplay_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_roleplay_sessions(id) on delete cascade,
  sender text not null, -- 'AI' | 'LEARNER'
  message_text text not null,
  audio_path text,
  corrections jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_roleplay_messages enable row level security;

create policy "Users read own roleplay messages"
  on public.ai_roleplay_messages for select
  using (
    exists (
      select 1 from public.ai_roleplay_sessions s
      where s.id = session_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users insert own roleplay messages"
  on public.ai_roleplay_messages for insert
  with check (
    exists (
      select 1 from public.ai_roleplay_sessions s
      where s.id = session_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

-- 8. Add updated_at triggers
create trigger touch_ai_feature_flags_updated_at before update on public.ai_feature_flags
for each row execute function public.touch_updated_at();

create trigger touch_ai_prompt_templates_updated_at before update on public.ai_prompt_templates
for each row execute function public.touch_updated_at();

create trigger touch_ai_saved_drafts_updated_at before update on public.ai_saved_drafts
for each row execute function public.touch_updated_at();

create trigger touch_ai_roleplay_sessions_updated_at before update on public.ai_roleplay_sessions
for each row execute function public.touch_updated_at();
