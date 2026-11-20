alter table public.restaurant_table_areas
  add column if not exists floor_label text check (floor_label is null or char_length(floor_label) <= 30),
  add column if not exists guests_move_for_food boolean not null default false;

create table if not exists public.guest_moves (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_table_bookings(id) on delete cascade,
  from_table_no integer not null,
  from_area_id uuid references public.restaurant_table_areas(id) on delete set null,
  guest_name text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'assigning', 'assigned', 'serve_here', 'done', 'cancelled')),
  to_table_no integer,
  to_area_id uuid references public.restaurant_table_areas(id) on delete set null,
  assigned_by uuid,
  assigned_at timestamptz,
  acked_by uuid,
  acked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists guest_moves_one_open
  on public.guest_moves (order_id) where status in ('waiting', 'assigning', 'assigned', 'serve_here');
create index if not exists guest_moves_restaurant_status on public.guest_moves (restaurant_id, status);

alter table public.guest_moves enable row level security;
drop policy if exists guest_moves_select on public.guest_moves;
create policy guest_moves_select on public.guest_moves for select
  using (can_manage_restaurant(restaurant_id) or is_platform_admin()
    or exists (select 1 from public.restaurant_staff rs where rs.restaurant_id = guest_moves.restaurant_id and rs.user_id = auth.uid()));

create or replace function public.guest_move_on_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_area uuid;
  v_moves boolean;
  v_items jsonb;
begin
  if new.booking_status = 'CANCELLED' or new.payment_status in ('PAID', 'COMPLETED') then
    update public.guest_moves
       set status = 'cancelled', updated_at = now()
     where order_id = new.id and status in ('waiting', 'assigning');
    return new;
  end if;

  if new.booking_status is distinct from 'SERVED' or old.booking_status is not distinct from 'SERVED' then
    return new;
  end if;

  select coalesce(host.area_id, tl.area_id), coalesce(ha.guests_move_for_food, a.guests_move_for_food, false)
    into v_area, v_moves
    from public.restaurant_table_layouts tl
    left join public.restaurant_table_areas a on a.id = tl.area_id
    left join public.restaurant_table_layouts host on host.id = tl.attached_to
    left join public.restaurant_table_areas ha on ha.id = host.area_id
   where tl.restaurant_id = new.restaurant_id and tl.table_no = new.table_no
   limit 1;

  if not coalesce(v_moves, false) then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'qty', (e->>'qty')::numeric)), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(new.order_items, '[]'::jsonb)) e
   where coalesce(e->>'station', 'kitchen') = 'kitchen';

  if jsonb_array_length(v_items) = 0 then
    return new;
  end if;

  insert into public.guest_moves (restaurant_id, order_id, from_table_no, from_area_id, guest_name, items)
  values (new.restaurant_id, new.id, new.table_no, v_area, nullif(btrim(coalesce(new.customer_name, '')), ''), v_items)
  on conflict (order_id) where status in ('waiting', 'assigning', 'assigned', 'serve_here') do nothing;
  return new;
end;
$$;

drop trigger if exists trg_guest_move_on_ready on public.restaurant_table_bookings;
create trigger trg_guest_move_on_ready
  after update of booking_status, payment_status on public.restaurant_table_bookings
  for each row execute function public.guest_move_on_ready();
