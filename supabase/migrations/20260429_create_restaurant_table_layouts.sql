create table if not exists public.restaurant_table_layouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_no integer not null,
  label text not null,
  shape text not null check (shape in ('circle','square','rectangle')),
  capacity integer not null check (capacity in (2,4,6,8,10,12)),
  pos_x numeric not null default 10,
  pos_y numeric not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, table_no)
);

create index if not exists idx_restaurant_table_layouts_restaurant_id
  on public.restaurant_table_layouts(restaurant_id);

alter table public.restaurant_table_layouts enable row level security;

drop policy if exists restaurant_table_layouts_select_policy on public.restaurant_table_layouts;
create policy restaurant_table_layouts_select_policy
on public.restaurant_table_layouts
for select
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_layouts.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_layouts.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);

drop policy if exists restaurant_table_layouts_insert_policy on public.restaurant_table_layouts;
create policy restaurant_table_layouts_insert_policy
on public.restaurant_table_layouts
for insert
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_layouts.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_layouts.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);

drop policy if exists restaurant_table_layouts_update_policy on public.restaurant_table_layouts;
create policy restaurant_table_layouts_update_policy
on public.restaurant_table_layouts
for update
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_layouts.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_layouts.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
)
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_layouts.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_layouts.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);

drop policy if exists restaurant_table_layouts_delete_policy on public.restaurant_table_layouts;
create policy restaurant_table_layouts_delete_policy
on public.restaurant_table_layouts
for delete
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_table_layouts.restaurant_id
      and r.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id = restaurant_table_layouts.restaurant_id
      and rs.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('admin','superadmin')
  )
);
