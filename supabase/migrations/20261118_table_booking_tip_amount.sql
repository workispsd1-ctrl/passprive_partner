alter table public.restaurant_table_bookings
  add column if not exists tip_amount numeric(12,2) not null default 0;

alter table public.restaurant_table_bookings
  drop constraint if exists restaurant_table_bookings_tip_amount_chk;
alter table public.restaurant_table_bookings
  add constraint restaurant_table_bookings_tip_amount_chk check (tip_amount >= 0);
