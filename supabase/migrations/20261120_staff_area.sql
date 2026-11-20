alter table public.restaurant_staff
  add column if not exists area_id uuid references public.restaurant_table_areas(id) on delete set null;
