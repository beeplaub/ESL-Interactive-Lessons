alter table public.ai_tutor_sessions
  add column if not exists token_issued_at timestamptz;
