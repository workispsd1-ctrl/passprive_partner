alter table public.restaurant_table_areas
  add column if not exists floor_objects jsonb not null default '[]'::jsonb;

alter table public.restaurant_table_areas
  add constraint restaurant_table_areas_floor_objects_check
  check (jsonb_typeof(floor_objects) = 'array' and jsonb_array_length(floor_objects) <= 24);
