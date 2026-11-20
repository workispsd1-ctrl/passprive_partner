alter table public.guest_moves add column if not exists ordered_by uuid;

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
  v_name text;
  v_by text;
begin
  if new.booking_status = 'CANCELLED' or new.payment_status in ('PAID', 'COMPLETED') then
    update public.guest_moves
       set status = 'cancelled', updated_at = now()
     where order_id = new.id and status = 'waiting';
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
    update public.guest_moves
       set status = 'cancelled', updated_at = now()
     where order_id = new.id and status = 'waiting';
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'qty', (e->>'qty')::numeric, 'note', e->>'note')), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(new.order_items, '[]'::jsonb)) e
   where coalesce(e->>'station', 'kitchen') = 'kitchen';

  v_name := nullif(btrim(coalesce(new.customer_name, '')), '');
  if v_name ilike 'staff order' then
    v_name := null;
  end if;

  if jsonb_array_length(v_items) = 0 then
    update public.guest_moves
       set status = 'cancelled', updated_at = now()
     where order_id = new.id and status = 'waiting';
    return new;
  end if;

  update public.guest_moves
     set items = v_items, guest_name = v_name, from_table_no = new.table_no, from_area_id = v_area, updated_at = now()
   where order_id = new.id and status = 'waiting';
  if found then
    return new;
  end if;

  v_by := coalesce(new.order_details->>'last_append_by', new.order_details->>'staff_user_id', new.order_details->>'cashier_user_id');
  if v_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_by := null;
  end if;

  insert into public.guest_moves (restaurant_id, order_id, from_table_no, from_area_id, guest_name, items, ordered_by)
  values (new.restaurant_id, new.id, new.table_no, v_area, v_name, v_items, v_by::uuid)
  on conflict (order_id) where status in ('waiting', 'assigning', 'assigned', 'serve_here') do nothing;
  return new;
end;
$$;

drop trigger if exists trg_guest_move_on_ready on public.restaurant_table_bookings;
create trigger trg_guest_move_on_ready
  after insert or update of order_items, table_no, customer_name, booking_status, payment_status
  on public.restaurant_table_bookings
  for each row execute function public.guest_move_on_ready();
