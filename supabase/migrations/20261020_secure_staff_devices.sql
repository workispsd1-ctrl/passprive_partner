-- Staff devices use the POS terminal pairing (20261018_pos_terminals.sql): the owner creates a one-time
-- code, the device swaps it for a token, and a PIN unlocks the paired device with lockout.
-- This migration adds per-staff PINs on top of that and stops merchants from changing their own plan.

-- 1. Staff PINs live in their own table, hashed, and readable only by the server.
create table if not exists public.restaurant_staff_pins (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

alter table public.restaurant_staff_pins enable row level security;
revoke all on public.restaurant_staff_pins from anon, authenticated;

create or replace function public.staff_set_pin(p_restaurant_id uuid, p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
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

-- Same lockout as pos_pin_login: 5 wrong PINs lock the device for 5 minutes, 10 for 24 hours.
create or replace function public.staff_pin_login(p_device_token text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.pos_terminals;
  v_user uuid;
  v_role text;
  v_failed int;
  v_lock timestamptz;
begin
  select * into v_row from public.pos_terminals
  where token_hash = encode(digest(coalesce(p_device_token, ''), 'sha256'), 'hex')
  for update;

  if not found or v_row.status <> 'active' or v_row.restaurant_id is null then
    return json_build_object('ok', false, 'error', 'device_not_paired');
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return json_build_object('ok', false, 'error', 'locked', 'locked_until', v_row.locked_until);
  end if;

  if coalesce(p_pin, '') ~ '^\d{4,6}$' then
    select p.user_id, s.role into v_user, v_role
    from public.restaurant_staff_pins p
    join public.restaurant_staff s on s.restaurant_id = p.restaurant_id and s.user_id = p.user_id
    where p.restaurant_id = v_row.restaurant_id and p.pin_hash = crypt(p_pin, p.pin_hash)
    limit 1;
  end if;

  if v_user is not null then
    update public.pos_terminals
    set failed_pin_count = 0, locked_until = null, last_login_at = now()
    where id = v_row.id;
    return json_build_object('ok', true, 'user_id', v_user, 'role', v_role, 'restaurant_id', v_row.restaurant_id);
  end if;

  v_failed := v_row.failed_pin_count + 1;
  v_lock := case
    when v_failed >= 10 then now() + interval '24 hours'
    when v_failed % 5 = 0 then now() + interval '5 minutes'
  end;

  update public.pos_terminals
  set failed_pin_count = v_failed, locked_until = v_lock
  where id = v_row.id;

  return json_build_object(
    'ok', false,
    'error', case when v_lock is null then 'wrong_pin' else 'locked' end,
    'locked_until', v_lock
  );
end;
$$;

revoke all on function public.staff_set_pin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.staff_pin_login(text, text) from public, anon, authenticated;
grant execute on function public.staff_set_pin(uuid, uuid, text) to service_role;
grant execute on function public.staff_pin_login(text, text) to service_role;

-- Staff accounts used their PIN as the password. Replace those passwords with random ones so the
-- only way in is a PIN on a paired device, and sign out every existing staff session (this also
-- revokes their refresh tokens). Owners set each staff PIN again from the Staff page.
update auth.users
set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
where email like '%@staff.passprive.local';

delete from auth.sessions
where user_id in (select id from auth.users where email like '%@staff.passprive.local');

-- 2. Plans are set by Pass Privé only: the admin portal (service key or a platform admin login).
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and lower(regexp_replace(coalesce(role, ''), '[\s_]+', '', 'g')) in ('admin', 'superadmin')
  )
$$;

create or replace function public.guard_restaurant_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No JWT role means a direct database connection (migrations, SQL editor).
  if coalesce(auth.role(), 'service_role') = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.service_level := 'discoverable';
    new.deals_enabled := false;
    new.merchant_plan := 'free';
  elsif (new.service_level, new.deals_enabled, new.merchant_plan)
        is distinct from (old.service_level, old.deals_enabled, old.merchant_plan) then
    raise exception 'Only Pass Privé can change a restaurant plan' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_restaurant_plan on public.restaurants;
create trigger guard_restaurant_plan
  before insert or update on public.restaurants
  for each row execute function public.guard_restaurant_plan();

revoke insert, update, delete on public.restaurant_subscriptions from anon, authenticated;
