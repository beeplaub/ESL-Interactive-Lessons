-- Read-path indexes for the bounded AI Studio analytics dashboard.
-- Safe and non-destructive; no application data is changed.

create index if not exists ai_generations_created_at_idx
  on public.ai_generations (created_at desc);

create index if not exists ai_credit_usage_usage_date_idx
  on public.ai_credit_usage (usage_date desc);

create index if not exists ai_daily_credit_balances_usage_date_idx
  on public.ai_daily_credit_balances (usage_date desc);

