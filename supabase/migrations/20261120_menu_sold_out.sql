create or replace function public.menu_item_sold_out(p_restaurant_id uuid, p_item_id text, p_sold_out boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_menu jsonb;
  v_secs jsonb;
  v_today text := to_char((now() at time zone 'Indian/Mauritius')::date, 'YYYY-MM-DD');
begin
  select coalesce(menu_json, '{}'::jsonb) into v_menu
    from public.restaurants where id = p_restaurant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_secs := case when jsonb_typeof(v_menu->'sections') = 'array' then v_menu->'sections' else '[]'::jsonb end;

  if not exists (
    select 1 from jsonb_array_elements(v_secs) s, jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
     where i->>'id' = p_item_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select jsonb_agg(jsonb_set(s, '{items}', coalesce((
           select jsonb_agg(case when i->>'id' = p_item_id
                                 then case when p_sold_out then i || jsonb_build_object('sold_out_on', v_today) else i - 'sold_out_on' end
                                 else i end order by io)
             from jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) with ordinality x(i, io)
         ), '[]'::jsonb)) order by o)
    into v_secs from jsonb_array_elements(v_secs) with ordinality e(s, o);

  update public.restaurants
     set menu_json = v_menu || jsonb_build_object('sections', coalesce(v_secs, '[]'::jsonb), 'updated_at', now())
   where id = p_restaurant_id;
  return jsonb_build_object('ok', true, 'sold_out_on', case when p_sold_out then v_today end);
end;
$$;

revoke all on function public.menu_item_sold_out(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.menu_item_sold_out(uuid, text, boolean) to service_role;
