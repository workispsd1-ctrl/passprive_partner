-- Run after 20261021_lock_orders_and_plans.sql.
--
-- Floor areas (Interior, Exterior, Rooftop, ...) for the table layout. Each table belongs to one area
-- and its pos_x / pos_y are relative to that area's floor map.

create table if not exists public.restaurant_table_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'interior'
    check (kind in ('interior','exterior','rooftop','terrace','garden','bar','private','other')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the composite FK below, so a table can only join an area of its own restaurant.
  unique (id, restaurant_id)
);

create unique index if not exists uq_restaurant_table_areas_name
  on public.restaurant_table_areas (restaurant_id, lower(btrim(name)));

create index if not exists idx_restaurant_table_areas_restaurant_id
  on public.restaurant_table_areas (restaurant_id, sort_order);

alter table public.restaurant_table_layouts
  add column if not exists area_id uuid;

alter table public.restaurant_table_layouts
  drop constraint if exists restaurant_table_layouts_area_fk;
-- restrict: an area must be emptied (tables moved or deleted) before it can be removed,
-- so deleting an area never silently deletes tables and their printed QR codes.
alter table public.restaurant_table_layouts
  add constraint restaurant_table_layouts_area_fk
  foreign key (area_id, restaurant_id)
  references public.restaurant_table_areas (id, restaurant_id)
  on delete restrict;

create index if not exists idx_restaurant_table_layouts_area_id
  on public.restaurant_table_layouts (area_id);

-- Existing layouts: put every current table in a default "Main Floor" area.
insert into public.restaurant_table_areas (restaurant_id, name, kind, sort_order)
select distinct l.restaurant_id, 'Main Floor', 'interior', 0
from public.restaurant_table_layouts l
where not exists (
  select 1 from public.restaurant_table_areas a where a.restaurant_id = l.restaurant_id
);

update public.restaurant_table_layouts l
set area_id = a.id
from public.restaurant_table_areas a
where l.area_id is null
  and a.restaurant_id = l.restaurant_id
  and a.sort_order = 0
  and lower(a.name) = 'main floor';

create or replace function public.set_restaurant_table_areas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_table_areas_updated_at on public.restaurant_table_areas;
create trigger trg_restaurant_table_areas_updated_at
before update on public.restaurant_table_areas
for each row execute function public.set_restaurant_table_areas_updated_at();

-- RLS: staff of the restaurant can read areas (floor maps on cashier / bearer screens);
-- only people who manage the restaurant can create, rename or delete them.
alter table public.restaurant_table_areas enable row level security;

drop policy if exists restaurant_table_areas_select on public.restaurant_table_areas;
create policy restaurant_table_areas_select
on public.restaurant_table_areas
for select
to authenticated
using (
  public.can_manage_restaurant(restaurant_id)
  or public.is_platform_admin()
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_areas.restaurant_id
      and rs.user_id = auth.uid()
  )
);

drop policy if exists restaurant_table_areas_insert on public.restaurant_table_areas;
create policy restaurant_table_areas_insert
on public.restaurant_table_areas
for insert
to authenticated
with check (public.can_manage_restaurant(restaurant_id) or public.is_platform_admin());

drop policy if exists restaurant_table_areas_update on public.restaurant_table_areas;
create policy restaurant_table_areas_update
on public.restaurant_table_areas
for update
to authenticated
using (public.can_manage_restaurant(restaurant_id) or public.is_platform_admin())
with check (public.can_manage_restaurant(restaurant_id) or public.is_platform_admin());

drop policy if exists restaurant_table_areas_delete on public.restaurant_table_areas;
create policy restaurant_table_areas_delete
on public.restaurant_table_areas
for delete
to authenticated
using (public.can_manage_restaurant(restaurant_id) or public.is_platform_admin());

revoke all on public.restaurant_table_areas from anon;
grant select, insert, update, delete on public.restaurant_table_areas to authenticated;
