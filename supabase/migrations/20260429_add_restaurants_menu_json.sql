alter table public.restaurants
add column if not exists menu_json jsonb;
