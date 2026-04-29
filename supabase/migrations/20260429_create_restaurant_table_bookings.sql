create table if not exists public.restaurant_table_bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_no integer not null,
  customer_name text null,
  customer_phone text null,
  order_items jsonb not null default '[]'::jsonb,
  order_details jsonb not null default '{}'::jsonb,
  subtotal_amount numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  payment_method text not null default 'DEMO',
  payment_status text not null default 'PAID',
  payment_reference text null,
  booking_status text not null default 'PLACED',
  source text not null default 'public_menu',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_table_bookings_table_no_check check (table_no > 0)
);

create index if not exists idx_restaurant_table_bookings_restaurant_id
  on public.restaurant_table_bookings(restaurant_id);

create index if not exists idx_restaurant_table_bookings_created_at
  on public.restaurant_table_bookings(created_at desc);

alter table public.restaurant_table_bookings enable row level security;

-- Public menu order placement (anonymous/authenticated) is allowed for active restaurants.
drop policy if exists restaurant_table_bookings_public_insert on public.restaurant_table_bookings;
create policy restaurant_table_bookings_public_insert
on public.restaurant_table_bookings
for insert
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_bookings.restaurant_id
      and r.is_active = true
  )
);

-- Restaurant owner/staff/admin can view and manage.
drop policy if exists restaurant_table_bookings_select_partner on public.restaurant_table_bookings;
create policy restaurant_table_bookings_select_partner
on public.restaurant_table_bookings
for select
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_bookings.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_bookings.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);

drop policy if exists restaurant_table_bookings_update_partner on public.restaurant_table_bookings;
create policy restaurant_table_bookings_update_partner
on public.restaurant_table_bookings
for update
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_bookings.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_bookings.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
)
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_bookings.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_bookings.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);

create or replace function public.set_restaurant_table_bookings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_table_bookings_set_updated_at on public.restaurant_table_bookings;
create trigger trg_restaurant_table_bookings_set_updated_at
before update on public.restaurant_table_bookings
for each row
execute function public.set_restaurant_table_bookings_updated_at();
