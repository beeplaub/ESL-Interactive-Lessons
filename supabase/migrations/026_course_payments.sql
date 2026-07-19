-- Add pricing and payment instruction columns to courses table
alter table public.courses
  add column if not exists price_bdt integer check (price_bdt is null or price_bdt >= 0),
  add column if not exists original_price_bdt integer check (original_price_bdt is null or original_price_bdt >= 0),
  add column if not exists payment_instructions text;

-- Create course_orders table
create table if not exists public.course_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  amount_bdt integer not null check (amount_bdt >= 0),
  payment_method text not null check (payment_method in ('BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER')),
  transaction_id text,
  sender_number text,
  receipt_path text,
  note text,
  admin_note text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on course_orders
alter table public.course_orders enable row level security;

-- Create policies for course_orders
drop policy if exists "Users read own orders" on public.course_orders;
create policy "Users read own orders" on public.course_orders
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users insert own orders" on public.course_orders;
create policy "Users insert own orders" on public.course_orders
  for insert with check (user_id = auth.uid());

drop policy if exists "Admins update all orders" on public.course_orders;
create policy "Admins update all orders" on public.course_orders
  for update using (public.is_admin());

-- Create a storage bucket for payment receipts
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- Create policies for storage bucket objects
drop policy if exists "Users upload own receipt" on storage.objects;
create policy "Users upload own receipt" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users/Admins read receipts" on storage.objects;
create policy "Users/Admins read receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Create automatic timestamp updater for course_orders
drop trigger if exists course_orders_touch_updated_at on public.course_orders;
create trigger course_orders_touch_updated_at before update on public.course_orders
  for each row execute function public.touch_updated_at();
