create or replace function public.trg_restaurant_bookings_request_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.source::text, '')) = 'app'
     and lower(coalesce(new.status::text, '')) = 'confirmed'
     and exists (
       select 1 from public.restaurants r
       where r.id = new.restaurant_id
         and r.booking_service_type::text = 'request'
     ) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_bookings_request_pending on public.restaurant_bookings;
create trigger restaurant_bookings_request_pending
before insert on public.restaurant_bookings
for each row execute function public.trg_restaurant_bookings_request_pending();
