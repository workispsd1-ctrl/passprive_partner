create table if not exists public.restaurant_printers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  ip text not null check (ip ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$'),
  port integer not null default 9100 check (port between 1 and 65535),
  paper_mm integer not null default 80 check (paper_mm in (58, 80)),
  prints text[] not null default '{}' check (prints <@ array['kitchen', 'bar', 'receipts']::text[]),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_restaurant_printers_restaurant on public.restaurant_printers (restaurant_id);

alter table public.restaurant_printers enable row level security;

drop policy if exists restaurant_printers_select on public.restaurant_printers;
create policy restaurant_printers_select on public.restaurant_printers for select
  using (can_manage_restaurant(restaurant_id) or is_platform_admin()
    or exists (select 1 from public.restaurant_staff rs where rs.restaurant_id = restaurant_printers.restaurant_id and rs.user_id = auth.uid()));
drop policy if exists restaurant_printers_insert on public.restaurant_printers;
create policy restaurant_printers_insert on public.restaurant_printers for insert
  with check (can_manage_restaurant(restaurant_id) or is_platform_admin());
drop policy if exists restaurant_printers_update on public.restaurant_printers;
create policy restaurant_printers_update on public.restaurant_printers for update
  using (can_manage_restaurant(restaurant_id) or is_platform_admin())
  with check (can_manage_restaurant(restaurant_id) or is_platform_admin());
drop policy if exists restaurant_printers_delete on public.restaurant_printers;
create policy restaurant_printers_delete on public.restaurant_printers for delete
  using (can_manage_restaurant(restaurant_id) or is_platform_admin());

alter table public.print_jobs
  add column if not exists printer_id uuid references public.restaurant_printers(id) on delete set null;
create index if not exists idx_print_jobs_printer on public.print_jobs (printer_id) where printer_id is not null;
