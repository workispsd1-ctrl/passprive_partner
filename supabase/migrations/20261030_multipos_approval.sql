alter table public.pos_terminals
  add column if not exists needs_approval boolean not null default false;

alter table public.pos_terminals drop constraint if exists pos_terminals_status_check;
alter table public.pos_terminals
  add constraint pos_terminals_status_check check (status in ('pending', 'awaiting', 'active', 'revoked'));

create or replace function public.pos_pair(p_code text, p_device_model text, p_app_version text)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    set status = case when v_row.needs_approval then 'awaiting' else 'active' end,
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
    'status', v_row.status,
    'merchant_name', public.pos_merchant_name(v_row.restaurant_id, v_row.store_id)
  );
end;
$function$;

create or replace function public.pos_multipos_remove(p_terminal_id uuid, p_restaurant_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.pos_terminals;
begin
  update public.pos_terminals
  set status = 'revoked', token_hash = null, pairing_code_hash = null, pairing_expires_at = null,
      revoked_at = now()
  where id = p_terminal_id and restaurant_id = p_restaurant_id and status in ('awaiting', 'active')
  returning * into v_row;

  if not found then
    return false;
  end if;

  if v_row.auth_user_id is not null then
    delete from auth.sessions where user_id = v_row.auth_user_id;
  end if;
  return true;
end;
$function$;

revoke all on function public.pos_pair(text, text, text) from public, anon, authenticated;
revoke all on function public.pos_multipos_remove(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pos_pair(text, text, text) to service_role;
grant execute on function public.pos_multipos_remove(uuid, uuid) to service_role;
