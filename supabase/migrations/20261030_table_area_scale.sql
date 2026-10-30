alter table public.restaurant_table_areas
  add column if not exists table_scale numeric not null default 1
  check (table_scale between 0.3 and 1.6);
