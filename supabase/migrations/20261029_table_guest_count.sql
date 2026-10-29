alter table public.restaurant_table_bookings
  add column if not exists guest_count smallint
  check (guest_count is null or guest_count between 1 and 99);
