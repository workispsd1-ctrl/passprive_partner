create or replace function public.pos_pending_bookings()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(b) order by b.created_at), '[]'::json)
  from (
    select
      rb.id,
      rb.customer_name,
      rb.customer_phone,
      rb.party_size,
      rb.booking_date,
      left(rb.booking_time::text, 5) as booking_time,
      rb.special_request,
      coalesce(rb.booking_code, rb.customer_booking_number::text) as booking_code,
      rb.created_at
    from public.restaurant_bookings rb
    join public.pos_terminals t
      on t.restaurant_id = rb.restaurant_id
     and t.auth_user_id = auth.uid()
     and t.status = 'active'
    where auth.uid() is not null
      and (
        lower(rb.status) = 'pending'
        or (
          lower(rb.status) in ('confirmed', 'payment_successfull')
          and coalesce(rb.read, false) = false
          and rb.created_at >= now() - interval '24 hours'
        )
      )
      and rb.booking_date >= (now() at time zone 'Indian/Mauritius')::date
    order by rb.created_at
    limit 20
  ) b
$$;

create or replace function public.pos_respond_booking(
  p_booking_id uuid,
  p_action text,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_booking public.restaurant_bookings%rowtype;
  v_status text;
begin
  select t.restaurant_id into v_restaurant_id
  from public.pos_terminals t
  where t.auth_user_id = auth.uid() and t.status = 'active' and auth.uid() is not null;

  if v_restaurant_id is null then
    return json_build_object('ok', false, 'error', 'device_not_paired');
  end if;

  select * into v_booking
  from public.restaurant_bookings
  where id = p_booking_id and restaurant_id = v_restaurant_id
  for update;

  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  v_status := lower(v_booking.status);

  if not (
    v_status = 'pending'
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
    if v_status = 'payment_successfull'
       or (coalesce(v_booking.payment_required, false)
           and coalesce(lower(v_booking.payment_status), '') = 'paid') then
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

  return json_build_object('ok', false, 'error', 'invalid_action');
end;
$$;

revoke all on function public.pos_pending_bookings() from public, anon;
revoke all on function public.pos_respond_booking(uuid, text, text) from public, anon;
grant execute on function public.pos_pending_bookings() to authenticated;
grant execute on function public.pos_respond_booking(uuid, text, text) to authenticated;
