-- RLS policies for store_service_items
-- Access matrix requested:
-- - superadmin/admin/storepartner/storeowner: full CRUD
-- - user: read-only

alter table public.store_service_items enable row level security;

-- Re-runnable migration safety
DROP POLICY IF EXISTS "store_service_items_select_by_role" ON public.store_service_items;
DROP POLICY IF EXISTS "store_service_items_insert_by_role" ON public.store_service_items;
DROP POLICY IF EXISTS "store_service_items_update_by_role" ON public.store_service_items;
DROP POLICY IF EXISTS "store_service_items_delete_by_role" ON public.store_service_items;
DROP POLICY IF EXISTS "store_service_items_service_role_all" ON public.store_service_items;

create policy "store_service_items_select_by_role"
on public.store_service_items
for select
to authenticated
using (
  lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'user_role',
      auth.jwt() ->> 'role',
      'user'
    )
  ) in ('superadmin', 'admin', 'storepartner', 'storeowner', 'user')
);

create policy "store_service_items_insert_by_role"
on public.store_service_items
for insert
to authenticated
with check (
  lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'user_role',
      auth.jwt() ->> 'role',
      'user'
    )
  ) in ('superadmin', 'admin', 'storepartner', 'storeowner')
);

create policy "store_service_items_update_by_role"
on public.store_service_items
for update
to authenticated
using (
  lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'user_role',
      auth.jwt() ->> 'role',
      'user'
    )
  ) in ('superadmin', 'admin', 'storepartner', 'storeowner')
)
with check (
  lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'user_role',
      auth.jwt() ->> 'role',
      'user'
    )
  ) in ('superadmin', 'admin', 'storepartner', 'storeowner')
);

create policy "store_service_items_delete_by_role"
on public.store_service_items
for delete
to authenticated
using (
  lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'user_role',
      auth.jwt() ->> 'role',
      'user'
    )
  ) in ('superadmin', 'admin', 'storepartner', 'storeowner')
);

-- Optional backend/service-key access (kept unrestricted for server workflows)
create policy "store_service_items_service_role_all"
on public.store_service_items
for all
to service_role
using (true)
with check (true);
