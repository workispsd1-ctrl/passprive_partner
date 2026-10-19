alter table public.restaurant_bookings
  add column if not exists proposed_date date,
  add column if not exists proposed_time time,
  add column if not exists proposed_at timestamptz;

create or replace function public.booking_proposal_live(p_booking public.restaurant_bookings)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_booking.proposed_at is not null
     and p_booking.proposed_date is not null
     and p_booking.proposed_time is not null
     and lower(p_booking.status) = 'pending'
     and (p_booking.proposed_date + p_booking.proposed_time) > (now() at time zone 'Indian/Mauritius')
$$;

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
      rb.status,
      rb.created_at
    from public.restaurant_bookings rb
    join public.pos_terminals t
      on t.restaurant_id = rb.restaurant_id
     and t.auth_user_id = auth.uid()
     and t.status = 'active'
    where auth.uid() is not null
      and (
        (lower(rb.status) = 'pending' and rb.proposed_at is null)
        or (
          lower(rb.status) in ('confirmed', 'payment_successfull')
          and coalesce(rb.read, false) = false
          and greatest(rb.created_at, coalesce(rb.proposed_at, rb.created_at)) >= now() - interval '24 hours'
        )
      )
      and rb.booking_date >= (now() at time zone 'Indian/Mauritius')::date
    order by rb.created_at
    limit 20
  ) b
$$;

drop function if exists public.pos_respond_booking(uuid, text, text);

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
  v_booking public.restaurant_bookings%rowtype;
  v_status text;
  v_paid boolean;
  v_date date;
  v_time time;
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

create or replace function public.respond_booking_proposal(p_booking_id uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.restaurant_bookings%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into v_booking
  from public.restaurant_bookings
  where id = p_booking_id and customer_user_id = auth.uid()
  for update;

  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  if not public.booking_proposal_live(v_booking) then
    return json_build_object('ok', false, 'error', 'proposal_expired');
  end if;

  if p_accept then
    update public.restaurant_bookings
    set booking_date = v_booking.proposed_date,
        booking_time = v_booking.proposed_time,
        booked_slot_label = to_char(v_booking.proposed_time, 'HH24:MI'),
        status = 'confirmed',
        read = false,
        proposed_at = now(),
        updated_at = now()
    where id = p_booking_id;
    return json_build_object('ok', true, 'status', 'confirmed');
  end if;

  update public.restaurant_bookings
  set status = 'cancelled',
      cancel_reason = 'Customer declined the proposed time',
      cancelled_at = now(),
      updated_at = now()
  where id = p_booking_id;
  return json_build_object('ok', true, 'status', 'cancelled');
end;
$$;

create or replace function public.expire_booking_proposals()
returns void
language sql
security definer
set search_path = public
as $$
  update public.restaurant_bookings
  set status = 'cancelled',
      cancel_reason = 'Proposed time expired',
      cancelled_at = now(),
      updated_at = now()
  where lower(status) = 'pending'
    and proposed_at is not null
    and (proposed_date + proposed_time) <= (now() at time zone 'Indian/Mauritius')
$$;

revoke all on function public.booking_proposal_live(public.restaurant_bookings) from public, anon, authenticated;
revoke all on function public.pos_pending_bookings() from public, anon;
revoke all on function public.pos_respond_booking(uuid, text, text, text, text) from public, anon;
revoke all on function public.respond_booking_proposal(uuid, boolean) from public, anon;
revoke all on function public.expire_booking_proposals() from public, anon, authenticated;
grant execute on function public.pos_pending_bookings() to authenticated;
grant execute on function public.pos_respond_booking(uuid, text, text, text, text) to authenticated;
grant execute on function public.respond_booking_proposal(uuid, boolean) to authenticated;

select cron.schedule('expire-booking-proposals', '*/5 * * * *', 'select public.expire_booking_proposals()');

create or replace function public.pos_bookings(p_date date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(b) order by b.booking_time, b.created_at), '[]'::json)
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
      lower(rb.status) as status,
      rb.cancel_reason,
      rb.proposed_date,
      left(rb.proposed_time::text, 5) as proposed_time,
      rb.proposed_at,
      rb.created_at
    from public.restaurant_bookings rb
    join public.pos_terminals t
      on t.restaurant_id = rb.restaurant_id
     and t.auth_user_id = auth.uid()
     and t.status = 'active'
    where auth.uid() is not null
      and rb.booking_date = p_date
    order by rb.booking_time, rb.created_at
    limit 300
  ) b
$$;

revoke all on function public.pos_bookings(date) from public, anon;
grant execute on function public.pos_bookings(date) to authenticated;
