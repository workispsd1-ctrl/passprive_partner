-- Staff PINs are exactly 4 digits. Existing PINs (some 5-6 digits) are cleared; the owner sets
-- a new 4-digit PIN for each staff member from the Staff page.

create or replace function public.staff_set_pin(p_restaurant_id uuid, p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890') > 0 or position(p_pin in '09876543210') > 0 then
    raise exception 'PIN is too easy to guess. Avoid repeated or sequential digits';
  end if;
  if not exists (
    select 1 from public.restaurant_staff where restaurant_id = p_restaurant_id and user_id = p_user_id
  ) then
    raise exception 'Staff member not found';
  end if;
  -- A PIN identifies the staff member at the device, so it must be unique within the restaurant.
  if exists (
    select 1 from public.restaurant_staff_pins
    where restaurant_id = p_restaurant_id and user_id <> p_user_id and pin_hash = crypt(p_pin, pin_hash)
  ) then
    raise exception 'Another staff member already uses this PIN. Choose a different one';
  end if;

  insert into public.restaurant_staff_pins (restaurant_id, user_id, pin_hash)
  values (p_restaurant_id, p_user_id, crypt(p_pin, gen_salt('bf', 10)))
  on conflict (restaurant_id, user_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- staff_pin_login only matches stored hashes, so with the table empty no PIN works until a new one is set.
-- The app already rejects anything but 4 digits before calling it.
delete from public.restaurant_staff_pins;

-- Start every device's wrong-PIN count fresh for the new PINs.
update public.pos_terminals set failed_pin_count = 0, locked_until = null where restaurant_id is not null;

revoke all on function public.staff_set_pin(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.staff_set_pin(uuid, uuid, text) to service_role;
