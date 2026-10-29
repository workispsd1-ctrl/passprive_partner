-- The Staff page shows one permanent setup QR per restaurant/store instead of a one-time code that
-- expired after 15 minutes. Scanning it pairs a new device; staff still need their PIN to sign in.
-- The code only changes when the owner explicitly resets it (e.g. if the QR leaked).

create table if not exists public.pos_setup_codes (
  restaurant_id uuid unique references public.restaurants(id) on delete cascade,
  store_id uuid unique references public.stores(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint pos_setup_codes_one_merchant check (num_nonnulls(restaurant_id, store_id) = 1)
);

alter table public.pos_setup_codes enable row level security;
revoke all on public.pos_setup_codes from anon, authenticated;

-- 12 chars from a 32-letter alphabet (60 bits): long enough to stay unguessable without an expiry.
create or replace function public.pos_new_setup_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := gen_random_bytes(12);
  v_code text := '';
begin
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- Returns the merchant's setup code, creating it on first use. p_reset = true replaces it.
create or replace function public.pos_get_setup_code(p_restaurant_id uuid, p_store_id uuid, p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if num_nonnulls(p_restaurant_id, p_store_id) <> 1 then
    raise exception 'Pick exactly one restaurant or store';
  end if;
  if not public.pos_can_manage(p_restaurant_id, p_store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select code into v_code from public.pos_setup_codes
  where restaurant_id is not distinct from p_restaurant_id and store_id is not distinct from p_store_id;

  if v_code is null then
    v_code := public.pos_new_setup_code();
    insert into public.pos_setup_codes (restaurant_id, store_id, code)
    values (p_restaurant_id, p_store_id, v_code);
  elsif p_reset then
    v_code := public.pos_new_setup_code();
    update public.pos_setup_codes set code = v_code, created_at = now()
    where restaurant_id is not distinct from p_restaurant_id and store_id is not distinct from p_store_id;
  end if;

  return v_code;
end;
$$;

-- Accepts either a one-time pairing code (POS Terminals panel) or the merchant's permanent setup code.
create or replace function public.pos_pair(p_code text, p_device_model text, p_app_version text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.pos_terminals;
  v_setup public.pos_setup_codes;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v_row from public.pos_terminals
  where pairing_code_hash = encode(digest(v_code, 'sha256'), 'hex')
    and status = 'pending' and pairing_expires_at > now()
  for update;

  if found then
    update public.pos_terminals
    set status = 'active',
        token_hash = encode(digest(v_token, 'sha256'), 'hex'),
        pairing_code_hash = null,
        pairing_expires_at = null,
        paired_at = now(),
        device_model = left(p_device_model, 80),
        app_version = left(p_app_version, 20)
    where id = v_row.id
    returning * into v_row;
  else
    select * into v_setup from public.pos_setup_codes where code = v_code;
    if not found then
      return json_build_object('ok', false, 'error', 'invalid_code');
    end if;

    -- PIN lockout is per device, so a leaked QR could mint fresh devices to keep guessing.
    -- Block new setup-code devices once this merchant's devices have 5+ unresolved wrong PINs in total
    -- (owner clears them via unlock/revoke), and cap how many can be added per day.
    if (
      select coalesce(sum(failed_pin_count), 0) from public.pos_terminals
      where restaurant_id is not distinct from v_setup.restaurant_id
        and store_id is not distinct from v_setup.store_id
        and status = 'active'
    ) >= 5 or (
      select count(*) from public.pos_terminals
      where restaurant_id is not distinct from v_setup.restaurant_id
        and store_id is not distinct from v_setup.store_id
        and token_hash is not null and pairing_code_hash is null
        and label = 'Staff device'
        and paired_at > now() - interval '24 hours'
    ) >= 20 then
      return json_build_object('ok', false, 'error', 'invalid_code');
    end if;

    insert into public.pos_terminals (
      restaurant_id, store_id, label, status, token_hash, paired_at, device_model, app_version
    )
    values (
      v_setup.restaurant_id, v_setup.store_id, 'Staff device', 'active',
      encode(digest(v_token, 'sha256'), 'hex'), now(), left(p_device_model, 80), left(p_app_version, 20)
    )
    returning * into v_row;
  end if;

  return json_build_object(
    'ok', true,
    'terminal_id', v_row.id,
    'device_token', v_token,
    'label', v_row.label,
    'merchant_name', public.pos_merchant_name(v_row.restaurant_id, v_row.store_id)
  );
end;
$$;

revoke all on function public.pos_new_setup_code() from public, anon, authenticated;
revoke all on function public.pos_get_setup_code(uuid, uuid, boolean) from public, anon;
revoke all on function public.pos_pair(text, text, text) from public, anon, authenticated;
grant execute on function public.pos_get_setup_code(uuid, uuid, boolean) to authenticated;
grant execute on function public.pos_pair(text, text, text) to service_role;

-- Let PostgREST see the new function immediately.
notify pgrst, 'reload schema';
