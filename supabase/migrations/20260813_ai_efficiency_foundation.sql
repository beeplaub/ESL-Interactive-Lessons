-- BrenUp AI efficiency foundation
-- Server-only exact-response cache, duplicate-generation locks, atomic credit budgets,
-- and complete generation telemetry. Existing AI tables and records are preserved.

alter table public.ai_generations
  add column if not exists provider text not null default 'google',
  add column if not exists status text not null default 'COMPLETED',
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists cached_tokens integer,
  add column if not exists latency_ms integer,
  add column if not exists retry_count integer not null default 0,
  add column if not exists estimated_cost_usd numeric(12, 6),
  add column if not exists cache_hit boolean not null default false,
  add column if not exists cache_key text,
  add column if not exists cefr_level text,
  add column if not exists prompt_version text,
  add column if not exists completed_at timestamptz;

create index if not exists ai_generations_feature_created_idx
  on public.ai_generations (feature_key, created_at desc);
create index if not exists ai_generations_user_created_idx
  on public.ai_generations (user_id, created_at desc);

create table if not exists public.ai_response_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  feature_key text not null,
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  response_json jsonb not null,
  hit_count bigint not null default 0,
  expires_at timestamptz,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_response_cache_expiry_idx
  on public.ai_response_cache (expires_at)
  where expires_at is not null;

alter table public.ai_response_cache enable row level security;
revoke all on table public.ai_response_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_response_cache to service_role;

create table if not exists public.ai_generation_locks (
  cache_key text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_locks_expiry_idx
  on public.ai_generation_locks (expires_at);

alter table public.ai_generation_locks enable row level security;
revoke all on table public.ai_generation_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_generation_locks to service_role;

create table if not exists public.ai_daily_credit_balances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  credits_reserved numeric(12, 3) not null default 0 check (credits_reserved >= 0),
  credits_used numeric(12, 3) not null default 0 check (credits_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.ai_credit_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  feature_key text not null,
  credits_used numeric(12, 3) not null default 0,
  request_count integer not null default 0,
  cache_hit_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  audio_seconds numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, feature_key)
);

alter table public.ai_daily_credit_balances enable row level security;
alter table public.ai_credit_usage enable row level security;
revoke all on table public.ai_daily_credit_balances from public, anon, authenticated;
revoke all on table public.ai_credit_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_daily_credit_balances to service_role;
grant select, insert, update, delete on table public.ai_credit_usage to service_role;

create or replace function public.claim_ai_generation_lock(
  p_cache_key text,
  p_owner_token uuid,
  p_ttl_seconds integer default 90
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_owner uuid;
begin
  insert into public.ai_generation_locks (cache_key, owner_token, expires_at)
  values (p_cache_key, p_owner_token, now() + make_interval(secs => greatest(10, p_ttl_seconds)))
  on conflict (cache_key) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        created_at = now()
    where public.ai_generation_locks.expires_at <= now()
  returning owner_token into claimed_owner;

  return claimed_owner = p_owner_token;
end;
$$;

create or replace function public.release_ai_generation_lock(
  p_cache_key text,
  p_owner_token uuid
)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.ai_generation_locks
  where cache_key = p_cache_key and owner_token = p_owner_token;
$$;

create or replace function public.reserve_ai_credits(
  p_user_id uuid,
  p_credits numeric,
  p_daily_limit numeric
)
returns table (allowed boolean, remaining numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  balance public.ai_daily_credit_balances%rowtype;
  requested numeric := greatest(0, coalesce(p_credits, 0));
  daily_limit numeric := greatest(0, coalesce(p_daily_limit, 0));
begin
  insert into public.ai_daily_credit_balances (user_id, usage_date)
  values (p_user_id, current_date)
  on conflict (user_id, usage_date) do nothing;

  select * into balance
  from public.ai_daily_credit_balances
  where user_id = p_user_id and usage_date = current_date
  for update;

  if balance.credits_used + balance.credits_reserved + requested > daily_limit then
    return query select false, greatest(0, daily_limit - balance.credits_used - balance.credits_reserved);
    return;
  end if;

  update public.ai_daily_credit_balances
  set credits_reserved = credits_reserved + requested, updated_at = now()
  where user_id = p_user_id and usage_date = current_date;

  return query select true, greatest(0, daily_limit - balance.credits_used - balance.credits_reserved - requested);
end;
$$;

create or replace function public.settle_ai_credits(
  p_user_id uuid,
  p_feature_key text,
  p_reserved_credits numeric,
  p_actual_credits numeric,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_audio_seconds numeric default 0,
  p_cache_hit boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.ai_daily_credit_balances (user_id, usage_date)
  values (p_user_id, current_date)
  on conflict (user_id, usage_date) do nothing;

  update public.ai_daily_credit_balances
  set credits_reserved = greatest(0, credits_reserved - greatest(0, coalesce(p_reserved_credits, 0))),
      credits_used = credits_used + greatest(0, coalesce(p_actual_credits, 0)),
      updated_at = now()
  where user_id = p_user_id and usage_date = current_date;

  insert into public.ai_credit_usage (
    user_id, usage_date, feature_key, credits_used, request_count, cache_hit_count,
    input_tokens, output_tokens, audio_seconds
  ) values (
    p_user_id, current_date, p_feature_key, greatest(0, coalesce(p_actual_credits, 0)),
    case when p_cache_hit then 0 else 1 end, case when p_cache_hit then 1 else 0 end,
    greatest(0, coalesce(p_input_tokens, 0)), greatest(0, coalesce(p_output_tokens, 0)),
    greatest(0, coalesce(p_audio_seconds, 0))
  )
  on conflict (user_id, usage_date, feature_key) do update set
    credits_used = public.ai_credit_usage.credits_used + excluded.credits_used,
    request_count = public.ai_credit_usage.request_count + excluded.request_count,
    cache_hit_count = public.ai_credit_usage.cache_hit_count + excluded.cache_hit_count,
    input_tokens = public.ai_credit_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_credit_usage.output_tokens + excluded.output_tokens,
    audio_seconds = public.ai_credit_usage.audio_seconds + excluded.audio_seconds,
    updated_at = now();
end;
$$;

create or replace function public.release_ai_credits(
  p_user_id uuid,
  p_reserved_credits numeric
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.ai_daily_credit_balances
  set credits_reserved = greatest(0, credits_reserved - greatest(0, coalesce(p_reserved_credits, 0))),
      updated_at = now()
  where user_id = p_user_id and usage_date = current_date;
$$;

revoke all on function public.claim_ai_generation_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_ai_generation_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai_credits(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.settle_ai_credits(uuid, text, numeric, numeric, bigint, bigint, numeric, boolean) from public, anon, authenticated;
revoke all on function public.release_ai_credits(uuid, numeric) from public, anon, authenticated;
grant execute on function public.claim_ai_generation_lock(text, uuid, integer) to service_role;
grant execute on function public.release_ai_generation_lock(text, uuid) to service_role;
grant execute on function public.reserve_ai_credits(uuid, numeric, numeric) to service_role;
grant execute on function public.settle_ai_credits(uuid, text, numeric, numeric, bigint, bigint, numeric, boolean) to service_role;
grant execute on function public.release_ai_credits(uuid, numeric) to service_role;

