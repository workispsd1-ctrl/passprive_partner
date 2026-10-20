-- Run after 20261020_secure_staff_devices.sql.

-- 1. Table QR links carry a secret per-table key, so knowing a restaurant id is not enough to read
--    or add to a table's open order. Existing tables get their own random key; reprint table QRs.
alter table public.restaurant_table_layouts
  add column if not exists qr_key text not null default encode(extensions.gen_random_bytes(12), 'hex');

-- 2. Table orders are written only by the server (/api/public-menu/orders and staff APIs). The old
--    policy let anyone insert rows straight through the public API, with any totals or status.
drop policy if exists restaurant_table_bookings_public_insert on public.restaurant_table_bookings;

-- 3. Money, plan, promotion and ownership fields are set by Pass Privé only (admin portal with the
--    service key or a platform admin login). Columns are read through jsonb so a column that does not
--    exist in this database is simply skipped instead of breaking every restaurant update.
create or replace function public.guard_restaurant_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin_only constant text[] := array[
    'owner_user_id', 'merchant_plan', 'service_level', 'deals_enabled', 'pay_bill_enabled',
    'booking_service_type', 'is_advertised', 'is_promoted', 'cashback_enabled', 'ad_priority',
    'ad_badge_text', 'ad_starts_at', 'ad_ends_at', 'onboarding_charge', 'monthly_charge',
    'mdr_agreed_cim', 'mdr_rate', 'merchant_total_rate', 'merchant_reward_rate', 'brn',
    'registered_name', 'kyc_status', 'is_verified'
  ];
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_col text;
begin
  -- No JWT role means a direct database connection (migrations, SQL editor).
  if coalesce(auth.role(), 'service_role') = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Only Pass Privé can create restaurants' using errcode = '42501';
  end if;

  v_old := to_jsonb(old);
  foreach v_col in array v_admin_only loop
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception 'Only Pass Privé can change %', v_col using errcode = '42501';
    end if;
  end loop;

  -- Bookings can only be switched on when the plan includes them.
  if coalesce((v_new ->> 'booking_enabled')::boolean, false)
     and not coalesce((v_old ->> 'booking_enabled')::boolean, false)
     and coalesce(v_new ->> 'service_level', '') not in ('booking', 'payments') then
    raise exception 'Bookings are not included in this restaurant''s service' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- The trigger itself already exists from 20261020; recreate it in case that step was skipped.
drop trigger if exists guard_restaurant_plan on public.restaurants;
create trigger guard_restaurant_plan
  before insert or update on public.restaurants
  for each row execute function public.guard_restaurant_plan();

-- 4. Nobody can make themselves a platform admin from the browser. Other role values are left alone
--    because the store "add manager" flow still writes them from the browser.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new_role text := lower(regexp_replace(coalesce(new.role, ''), '[\s_]+', '', 'g'));
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Roles are changed by Pass Privé only' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and v_new_role in ('admin', 'superadmin') then
    raise exception 'Roles are changed by Pass Privé only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_role on public.users;
create trigger guard_user_role
  before insert or update on public.users
  for each row execute function public.guard_user_role();
