-- Allow restaurant_admin to manage restaurant_staff rows via RLS.
-- Existing policies remain; these are additive permissive policies.

drop policy if exists restaurant_staff_select_restaurant_admin on public.restaurant_staff;
create policy restaurant_staff_select_restaurant_admin
on public.restaurant_staff
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('restaurant_admin')
  )
);

drop policy if exists restaurant_staff_insert_restaurant_admin on public.restaurant_staff;
create policy restaurant_staff_insert_restaurant_admin
on public.restaurant_staff
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('restaurant_admin')
  )
);

drop policy if exists restaurant_staff_update_restaurant_admin on public.restaurant_staff;
create policy restaurant_staff_update_restaurant_admin
on public.restaurant_staff
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('restaurant_admin')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('restaurant_admin')
  )
);

drop policy if exists restaurant_staff_delete_restaurant_admin on public.restaurant_staff;
create policy restaurant_staff_delete_restaurant_admin
on public.restaurant_staff
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('restaurant_admin')
  )
);

