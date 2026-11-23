create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text,
  credit_limit numeric check (credit_limit is null or credit_limit >= 0),
  notes text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_accounts_restaurant_idx on public.customer_accounts (restaurant_id, active);

create table if not exists public.customer_account_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('CASH','CARD','MAUCAS','JUICE','CHEQUE','BANK','AVOIR')),
  reference text,
  gateway jsonb,
  allocations jsonb not null default '[]'::jsonb,
  idempotency_key text not null,
  note text,
  terminal_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);
create index if not exists customer_account_payments_account_idx on public.customer_account_payments (account_id, created_at);

alter table public.restaurant_table_bookings
  add column if not exists account_id uuid references public.customer_accounts(id) on delete restrict;
create index if not exists restaurant_table_bookings_account_idx on public.restaurant_table_bookings (account_id) where account_id is not null;

alter table public.customer_accounts enable row level security;
alter table public.customer_account_payments enable row level security;
