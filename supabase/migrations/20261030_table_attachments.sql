alter table public.restaurant_table_layouts
  add column if not exists attached_to uuid references public.restaurant_table_layouts(id) on delete set null,
  add column if not exists attached_auto_release boolean not null default false;

alter table public.restaurant_table_layouts
  drop constraint if exists restaurant_table_layouts_attached_not_self;
alter table public.restaurant_table_layouts
  add constraint restaurant_table_layouts_attached_not_self
  check (attached_to is null or attached_to <> id);

create index if not exists idx_restaurant_table_layouts_attached_to
  on public.restaurant_table_layouts (attached_to)
  where attached_to is not null;
