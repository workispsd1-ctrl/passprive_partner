create or replace function public.merchant_respond_booking(
  p_restaurant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_reason text default null,
  p_proposed_date text default null,
  p_proposed_time text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.restaurant_bookings%rowtype;
  v_status text;
  v_paid boolean;
  v_date date;
  v_time time;
begin
  select * into v_booking
  from public.restaurant_bookings
  where id = p_booking_id and restaurant_id = p_restaurant_id
  for update;

  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  v_status := lower(v_booking.status);
  v_paid := v_status = 'payment_successfull'
    or (coalesce(v_booking.payment_required, false)
        and coalesce(lower(v_booking.payment_status), '') = 'paid');

  if not (
    (v_status = 'pending' and v_booking.proposed_at is null)
    or (v_status in ('confirmed', 'payment_successfull') and not coalesce(v_booking.read, false))
  ) then
    return json_build_object('ok', false, 'error', 'already_handled', 'status', v_booking.status);
  end if;

  if p_action = 'accept' then
    if v_status = 'pending' then
      if coalesce(v_booking.payment_required, false)
         and coalesce(lower(v_booking.payment_status), '') <> 'paid' then
        return json_build_object('ok', false, 'error', 'payment_pending');
      end if;
      v_status := 'confirmed';
    end if;
    update public.restaurant_bookings
    set status = v_status, read = true, updated_at = now()
    where id = p_booking_id;
    return json_build_object('ok', true, 'status', v_status);
  end if;

  if p_action = 'reject' then
    if v_paid then
      return json_build_object('ok', false, 'error', 'booking_paid');
    end if;
    update public.restaurant_bookings
    set status = 'cancelled',
        cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200),
        cancelled_at = now(),
        read = true,
        updated_at = now()
    where id = p_booking_id;
    return json_build_object('ok', true, 'status', 'cancelled');
  end if;

  if p_action = 'propose' then
    if v_paid then
      return json_build_object('ok', false, 'error', 'booking_paid');
    end if;
    if coalesce(p_proposed_date, '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(p_proposed_time, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return json_build_object('ok', false, 'error', 'invalid_time');
    end if;
    begin
      v_date := p_proposed_date::date;
    exception when others then
      return json_build_object('ok', false, 'error', 'invalid_time');
    end;
    v_time := p_proposed_time::time;
    if (v_date + v_time) <= (now() at time zone 'Indian/Mauritius')
       or (v_date = v_booking.booking_date and v_time = v_booking.booking_time) then
      return json_build_object('ok', false, 'error', 'invalid_time');
    end if;
    update public.restaurant_bookings
    set status = 'pending',
        proposed_date = v_date,
        proposed_time = v_time,
        proposed_at = now(),
        read = true,
        updated_at = now()
    where id = p_booking_id;
    return json_build_object('ok', true, 'status', 'proposed', 'proposed_date', v_date, 'proposed_time', p_proposed_time);
  end if;

  return json_build_object('ok', false, 'error', 'invalid_action');
end;
$$;

create or replace function public.pos_respond_booking(
  p_booking_id uuid,
  p_action text,
  p_reason text default null,
  p_proposed_date text default null,
  p_proposed_time text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  select t.restaurant_id into v_restaurant_id
  from public.pos_terminals t
  where t.auth_user_id = auth.uid() and t.status = 'active' and auth.uid() is not null;

  if v_restaurant_id is null then
    return json_build_object('ok', false, 'error', 'device_not_paired');
  end if;

  return public.merchant_respond_booking(v_restaurant_id, p_booking_id, p_action, p_reason, p_proposed_date, p_proposed_time);
end;
$$;

create or replace function public.partner_respond_booking(
  p_booking_id uuid,
  p_action text,
  p_reason text default null,
  p_proposed_date text default null,
  p_proposed_time text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select restaurant_id into v_restaurant_id
  from public.restaurant_bookings
  where id = p_booking_id;

  if v_restaurant_id is null or not public.can_manage_restaurant(v_restaurant_id) then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  return public.merchant_respond_booking(v_restaurant_id, p_booking_id, p_action, p_reason, p_proposed_date, p_proposed_time);
end;
$$;

revoke all on function public.merchant_respond_booking(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.partner_respond_booking(uuid, text, text, text, text) from public, anon;
grant execute on function public.partner_respond_booking(uuid, text, text, text, text) to authenticated;
