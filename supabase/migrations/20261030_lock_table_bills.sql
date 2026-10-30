drop policy if exists public_menu_insert_bookings on public.restaurant_table_bookings;
drop policy if exists public_menu_select_bookings on public.restaurant_table_bookings;
drop policy if exists public_menu_update_open_bookings on public.restaurant_table_bookings;
drop policy if exists restaurant_table_bookings_public_insert on public.restaurant_table_bookings;

revoke truncate on public.restaurant_table_bookings from anon, authenticated;

create or replace function public.guard_table_bill_money()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.restaurant_id is distinct from old.restaurant_id
    or new.total_amount is distinct from old.total_amount
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.tax_amount is distinct from old.tax_amount
    or new.order_items is distinct from old.order_items
    or new.order_details is distinct from old.order_details
    or new.payment_status is distinct from old.payment_status
    or new.payment_method is distinct from old.payment_method
    or new.payment_reference is distinct from old.payment_reference
    or (new.booking_status is distinct from old.booking_status and upper(coalesce(new.booking_status, '')) in ('PAID', 'CANCELLED'))
  then
    raise exception 'Bills can only be changed through the till.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_table_bill_money on public.restaurant_table_bookings;
create trigger guard_table_bill_money
  before update on public.restaurant_table_bookings
  for each row execute function public.guard_table_bill_money();
