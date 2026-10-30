alter table public.restaurant_table_areas drop constraint if exists restaurant_table_areas_kind_check;
alter table public.restaurant_table_areas
  add constraint restaurant_table_areas_kind_check
  check (kind = any (array['interior','exterior','rooftop','terrace','garden','bar','private','pool','beach','lounge','other']));
