-- Staff mapping tables
create table if not exists public.store_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create table if not exists public.restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create index if not exists idx_store_staff_store_id on public.store_staff(store_id);
create index if not exists idx_store_staff_user_id on public.store_staff(user_id);
create index if not exists idx_restaurant_staff_restaurant_id on public.restaurant_staff(restaurant_id);
create index if not exists idx_restaurant_staff_user_id on public.restaurant_staff(user_id);

alter table public.store_staff enable row level security;
alter table public.restaurant_staff enable row level security;

-- helper predicate repeated in policies: privileged roles
-- store_owner, store_partner, restaurant_partner, admin, superadmin

-- STORE_STAFF policies

drop policy if exists store_staff_select_policy on public.store_staff;
create policy store_staff_select_policy
on public.store_staff
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists store_staff_insert_policy on public.store_staff;
create policy store_staff_insert_policy
on public.store_staff
for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists store_staff_update_policy on public.store_staff;
create policy store_staff_update_policy
on public.store_staff
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists store_staff_delete_policy on public.store_staff;
create policy store_staff_delete_policy
on public.store_staff
for delete
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

-- RESTAURANT_STAFF policies

drop policy if exists restaurant_staff_select_policy on public.restaurant_staff;
create policy restaurant_staff_select_policy
on public.restaurant_staff
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists restaurant_staff_insert_policy on public.restaurant_staff;
create policy restaurant_staff_insert_policy
on public.restaurant_staff
for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists restaurant_staff_update_policy on public.restaurant_staff;
create policy restaurant_staff_update_policy
on public.restaurant_staff
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);

drop policy if exists restaurant_staff_delete_policy on public.restaurant_staff;
create policy restaurant_staff_delete_policy
on public.restaurant_staff
for delete
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('storeowner','store_owner','storepartner','store_partner','restaurantpartner','restaurant_partner','admin','superadmin')
  )
);
