alter table public.restaurants add column if not exists vat_number text;

alter table public.restaurant_table_bookings add column if not exists invoice_no bigint;
alter table public.restaurant_orders add column if not exists invoice_no bigint;
create unique index if not exists restaurant_table_bookings_invoice_no_uq on public.restaurant_table_bookings (restaurant_id, invoice_no) where invoice_no is not null;
create unique index if not exists restaurant_orders_invoice_no_uq on public.restaurant_orders (restaurant_id, invoice_no) where invoice_no is not null;

create table if not exists public.restaurant_invoice_counters (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  last_no bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.restaurant_invoice_counters enable row level security;

create or replace function public.assign_invoice_no(p_kind text, p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid uuid;
  v_no bigint;
begin
  if p_kind = 'table' then
    select restaurant_id, invoice_no into v_rid, v_no from restaurant_table_bookings where id = p_id for update;
  elsif p_kind = 'pickup' then
    select restaurant_id, invoice_no into v_rid, v_no from restaurant_orders where id = p_id for update;
  else
    raise exception 'unknown invoice kind %', p_kind;
  end if;
  if v_rid is null then return null; end if;
  if v_no is not null then return v_no; end if;
  insert into restaurant_invoice_counters as c (restaurant_id, last_no) values (v_rid, 1)
    on conflict (restaurant_id) do update set last_no = c.last_no + 1, updated_at = now()
    returning last_no into v_no;
  if p_kind = 'table' then
    update restaurant_table_bookings set invoice_no = v_no where id = p_id;
  else
    update restaurant_orders set invoice_no = v_no where id = p_id;
  end if;
  return v_no;
end;
$$;
revoke all on function public.assign_invoice_no(text, uuid) from public, anon, authenticated;
grant execute on function public.assign_invoice_no(text, uuid) to service_role;
