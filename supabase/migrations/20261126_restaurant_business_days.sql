create table if not exists public.restaurant_business_days (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  opened_at timestamptz not null default now(),
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  report jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists restaurant_business_days_one_open on public.restaurant_business_days (restaurant_id) where closed_at is null;
create index if not exists restaurant_business_days_recent on public.restaurant_business_days (restaurant_id, opened_at desc);
alter table public.restaurant_business_days enable row level security;
