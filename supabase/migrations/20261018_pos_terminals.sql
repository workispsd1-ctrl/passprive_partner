create table if not exists public.pos_terminals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  label text not null default 'POS',
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  token_hash text unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  device_model text,
  app_version text,
  failed_pin_count int not null default 0,
  locked_until timestamptz,
  paired_at timestamptz,
  last_login_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint pos_terminals_one_merchant check (num_nonnulls(restaurant_id, store_id) = 1)
);

create index if not exists pos_terminals_restaurant_idx on public.pos_terminals (restaurant_id);
create index if not exists pos_terminals_store_idx on public.pos_terminals (store_id);
create unique index if not exists pos_terminals_pairing_code_key on public.pos_terminals (pairing_code_hash) where pairing_code_hash is not null;

create table if not exists public.merchant_pos_pins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid unique references public.restaurants(id) on delete cascade,
  store_id uuid unique references public.stores(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint merchant_pos_pins_one_merchant check (num_nonnulls(restaurant_id, store_id) = 1)
);

alter table public.pos_terminals enable row level security;
alter table public.merchant_pos_pins enable row level security;

revoke all on public.pos_terminals from anon, authenticated;
revoke all on public.merchant_pos_pins from anon, authenticated;

create or replace function public.pos_can_manage(p_restaurant_id uuid, p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_restaurant_id is not null then public.can_manage_restaurant(p_restaurant_id)
    when p_store_id is not null then public.can_manage_store(p_store_id)
    else false
  end
$$;

grant select (
  id, restaurant_id, store_id, label, status, pairing_expires_at, device_model, app_version,
  failed_pin_count, locked_until, paired_at, last_login_at, revoked_at, created_at
) on public.pos_terminals to authenticated;

drop policy if exists pos_terminals_read on public.pos_terminals;
create policy pos_terminals_read on public.pos_terminals
  for select to authenticated
  using (public.pos_can_manage(restaurant_id, store_id));

create or replace function public.pos_merchant_name(p_restaurant_id uuid, p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select name from public.restaurants where id = p_restaurant_id),
    (select name from public.stores where id = p_store_id)
  )
$$;

create or replace function public.pos_set_pin(p_restaurant_id uuid, p_store_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if num_nonnulls(p_restaurant_id, p_store_id) <> 1 then
    raise exception 'Pick exactly one restaurant or store';
  end if;
  if not public.pos_can_manage(p_restaurant_id, p_store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890') > 0 or position(p_pin in '09876543210') > 0 then
    raise exception 'PIN is too easy to guess. Avoid repeated or sequential digits';
  end if;

  if p_restaurant_id is not null then
    insert into public.merchant_pos_pins (restaurant_id, pin_hash, updated_by)
    values (p_restaurant_id, crypt(p_pin, gen_salt('bf', 10)), auth.uid())
    on conflict (restaurant_id) do update
      set pin_hash = excluded.pin_hash, updated_at = now(), updated_by = excluded.updated_by;
    update public.pos_terminals set failed_pin_count = 0, locked_until = null where restaurant_id = p_restaurant_id;
  else
    insert into public.merchant_pos_pins (store_id, pin_hash, updated_by)
    values (p_store_id, crypt(p_pin, gen_salt('bf', 10)), auth.uid())
    on conflict (store_id) do update
      set pin_hash = excluded.pin_hash, updated_at = now(), updated_by = excluded.updated_by;
    update public.pos_terminals set failed_pin_count = 0, locked_until = null where store_id = p_store_id;
  end if;
end;
$$;

create or replace function public.pos_pin_status(p_restaurant_id uuid, p_store_id uuid)
returns table (has_pin boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pos_can_manage(p_restaurant_id, p_store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select true, p.updated_at
    from public.merchant_pos_pins p
    where (p_restaurant_id is not null and p.restaurant_id = p_restaurant_id)
       or (p_store_id is not null and p.store_id = p_store_id);
  if not found then
    return query select false, null::timestamptz;
  end if;
end;
$$;

create or replace function public.pos_create_pairing(p_restaurant_id uuid, p_store_id uuid, p_label text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := gen_random_bytes(8);
  v_code text := '';
  v_id uuid;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if num_nonnulls(p_restaurant_id, p_store_id) <> 1 then
    raise exception 'Pick exactly one restaurant or store';
  end if;
  if not public.pos_can_manage(p_restaurant_id, p_store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  delete from public.pos_terminals
  where status = 'pending' and pairing_expires_at < now()
    and restaurant_id is not distinct from p_restaurant_id
    and store_id is not distinct from p_store_id;

  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.pos_terminals (restaurant_id, store_id, label, pairing_code_hash, pairing_expires_at)
  values (
    p_restaurant_id, p_store_id,
    coalesce(nullif(trim(left(p_label, 40)), ''), 'POS'),
    encode(digest(v_code, 'sha256'), 'hex'),
    v_expires
  )
  returning id into v_id;

  return json_build_object('terminal_id', v_id, 'code', v_code, 'expires_at', v_expires);
end;
$$;

create or replace function public.pos_pair(p_code text, p_device_model text, p_app_version text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.pos_terminals;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v_row from public.pos_terminals
  where pairing_code_hash = encode(digest(v_code, 'sha256'), 'hex')
    and status = 'pending' and pairing_expires_at > now()
  for update;

  if not found then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.pos_terminals
  set status = 'active',
      token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      pairing_code_hash = null,
      pairing_expires_at = null,
      paired_at = now(),
      device_model = left(p_device_model, 80),
      app_version = left(p_app_version, 20)
  where id = v_row.id;

  return json_build_object(
    'ok', true,
    'terminal_id', v_row.id,
    'device_token', v_token,
    'label', v_row.label,
    'merchant_name', public.pos_merchant_name(v_row.restaurant_id, v_row.store_id)
  );
end;
$$;

create or replace function public.pos_pin_login(p_device_token text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.pos_terminals;
  v_hash text;
  v_failed int;
  v_lock timestamptz;
begin
  select * into v_row from public.pos_terminals
  where token_hash = encode(digest(coalesce(p_device_token, ''), 'sha256'), 'hex')
  for update;

  if not found or v_row.status <> 'active' then
    return json_build_object('ok', false, 'error', 'device_not_paired');
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return json_build_object('ok', false, 'error', 'locked', 'locked_until', v_row.locked_until);
  end if;

  select pin_hash into v_hash from public.merchant_pos_pins
  where restaurant_id is not distinct from v_row.restaurant_id
    and store_id is not distinct from v_row.store_id;

  if v_hash is null then
    return json_build_object('ok', false, 'error', 'pin_not_set');
  end if;

  if coalesce(p_pin, '') ~ '^\d{4,6}$' and crypt(p_pin, v_hash) = v_hash then
    update public.pos_terminals
    set failed_pin_count = 0, locked_until = null, last_login_at = now()
    where id = v_row.id;
    if v_row.auth_user_id is not null then
      delete from auth.sessions where user_id = v_row.auth_user_id;
    end if;
    return json_build_object(
      'ok', true,
      'terminal_id', v_row.id,
      'auth_user_id', v_row.auth_user_id,
      'label', v_row.label,
      'merchant_name', public.pos_merchant_name(v_row.restaurant_id, v_row.store_id)
    );
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

create or replace function public.pos_attach_auth_user(p_terminal_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pos_terminals set auth_user_id = p_user_id
  where id = p_terminal_id and auth_user_id is null and status = 'active'
$$;

create or replace function public.pos_revoke_terminal(p_terminal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pos_terminals;
begin
  select * into v_row from public.pos_terminals where id = p_terminal_id for update;
  if not found then
    raise exception 'Terminal not found';
  end if;
  if not public.pos_can_manage(v_row.restaurant_id, v_row.store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.pos_terminals
  set status = 'revoked', token_hash = null, pairing_code_hash = null, pairing_expires_at = null,
      revoked_at = now(), revoked_by = auth.uid()
  where id = p_terminal_id;

  if v_row.auth_user_id is not null then
    delete from auth.sessions where user_id = v_row.auth_user_id;
  end if;
end;
$$;

create or replace function public.pos_unlock_terminal(p_terminal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pos_terminals;
begin
  select * into v_row from public.pos_terminals where id = p_terminal_id;
  if not found then
    raise exception 'Terminal not found';
  end if;
  if not public.pos_can_manage(v_row.restaurant_id, v_row.store_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.pos_terminals set failed_pin_count = 0, locked_until = null where id = p_terminal_id;
end;
$$;

create or replace function public.pos_current_terminal()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'terminal_id', t.id,
    'label', t.label,
    'restaurant_id', t.restaurant_id,
    'store_id', t.store_id,
    'merchant_name', public.pos_merchant_name(t.restaurant_id, t.store_id)
  )
  from public.pos_terminals t
  where t.auth_user_id = auth.uid() and t.status = 'active' and auth.uid() is not null
$$;

revoke all on function public.pos_can_manage(uuid, uuid) from public, anon;
revoke all on function public.pos_merchant_name(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pos_set_pin(uuid, uuid, text) from public, anon;
revoke all on function public.pos_pin_status(uuid, uuid) from public, anon;
revoke all on function public.pos_create_pairing(uuid, uuid, text) from public, anon;
revoke all on function public.pos_revoke_terminal(uuid) from public, anon;
revoke all on function public.pos_unlock_terminal(uuid) from public, anon;
revoke all on function public.pos_current_terminal() from public, anon;
revoke all on function public.pos_pair(text, text, text) from public, anon, authenticated;
revoke all on function public.pos_pin_login(text, text) from public, anon, authenticated;
revoke all on function public.pos_attach_auth_user(uuid, uuid) from public, anon, authenticated;

grant execute on function public.pos_can_manage(uuid, uuid) to authenticated;
grant execute on function public.pos_set_pin(uuid, uuid, text) to authenticated;
grant execute on function public.pos_pin_status(uuid, uuid) to authenticated;
grant execute on function public.pos_create_pairing(uuid, uuid, text) to authenticated;
grant execute on function public.pos_revoke_terminal(uuid) to authenticated;
grant execute on function public.pos_unlock_terminal(uuid) to authenticated;
grant execute on function public.pos_current_terminal() to authenticated;
grant execute on function public.pos_merchant_name(uuid, uuid) to service_role;
grant execute on function public.pos_pair(text, text, text) to service_role;
grant execute on function public.pos_pin_login(text, text) to service_role;
grant execute on function public.pos_attach_auth_user(uuid, uuid) to service_role;
