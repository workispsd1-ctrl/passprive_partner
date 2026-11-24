alter table public.restaurant_table_bookings drop constraint restaurant_table_bookings_guest_count_check;
alter table public.restaurant_table_bookings add constraint restaurant_table_bookings_guest_count_check check (guest_count is null or (guest_count >= 0 and guest_count <= 99));
