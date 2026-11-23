alter table public.restaurant_bookings
  add column if not exists seated_at timestamptz,
  add column if not exists seated_order_id uuid references public.restaurant_table_bookings(id) on delete set null;
