create table if not exists public.pos_payment_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_table_bookings(id) on delete cascade,
  method text not null check (method in ('CARD', 'MAUCAS')),
  amount numeric(12,2) not null check (amount > 0),
  tip numeric(12,2) not null default 0 check (tip >= 0),
  items jsonb,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'declined')),
  requested_by uuid,
  handled_by uuid,
  part_no int,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_payment_requests_one_pending
  on public.pos_payment_requests (order_id) where status = 'pending';
create index if not exists pos_payment_requests_restaurant_pending
  on public.pos_payment_requests (restaurant_id, created_at) where status = 'pending';

alter table public.pos_payment_requests enable row level security;
