alter table public.restaurant_table_layouts add column if not exists rotation smallint not null default 0;
alter table public.restaurant_table_layouts drop constraint if exists restaurant_table_layouts_rotation_check;
alter table public.restaurant_table_layouts add constraint restaurant_table_layouts_rotation_check check (rotation >= 0 and rotation < 360);
