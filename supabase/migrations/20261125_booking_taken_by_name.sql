alter table public.restaurant_bookings add column if not exists taken_by_name text;
comment on column public.restaurant_bookings.taken_by_name is 'Staff member who took a manual reservation (waiter name auto-filled server-side).';
