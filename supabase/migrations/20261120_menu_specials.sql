create or replace function public.menu_special_edit(
  p_restaurant_id uuid,
  p_action text,
  p_kind text,
  p_item jsonb,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_menu jsonb;
  v_secs jsonb;
  v_sid text := case when p_kind = 'Bar' then 'special-bar' else 'special-kitchen' end;
  v_found boolean;
begin
  select coalesce(menu_json, '{}'::jsonb) into v_menu
    from public.restaurants where id = p_restaurant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_secs := case when jsonb_typeof(v_menu->'sections') = 'array' then v_menu->'sections' else '[]'::jsonb end;

  if p_action = 'add' then
    if not exists (select 1 from jsonb_array_elements(v_secs) s where s->>'id' = v_sid) then
      v_secs := jsonb_build_array(jsonb_build_object(
        'id', v_sid, 'name', 'Today''s Specials', 'group', case when v_sid = 'special-bar' then 'Bar' else 'Kitchen' end,
        'special', true, 'description', null, 'items', '[]'::jsonb, 'subcategories', '[]'::jsonb, 'comment_presets', '[]'::jsonb
      )) || v_secs;
    end if;
    select jsonb_agg(case when s->>'id' = v_sid then jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || jsonb_build_array(p_item)) else s end order by o)
      into v_secs from jsonb_array_elements(v_secs) with ordinality e(s, o);
  elsif p_action in ('show', 'hide', 'delete') then
    select exists (
      select 1 from jsonb_array_elements(v_secs) s, jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) i
       where (s->>'special')::boolean is true and i->>'id' = p_item_id
    ) into v_found;
    if not v_found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    select jsonb_agg(case when (s->>'special')::boolean is true then jsonb_set(s, '{items}', coalesce((
             select jsonb_agg(case when i->>'id' = p_item_id then jsonb_set(i, '{is_available}', to_jsonb(p_action = 'show')) else i end order by io)
               from jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) with ordinality x(i, io)
              where not (p_action = 'delete' and i->>'id' = p_item_id)
           ), '[]'::jsonb)) else s end order by o)
      into v_secs from jsonb_array_elements(v_secs) with ordinality e(s, o);
    select coalesce(jsonb_agg(s order by o), '[]'::jsonb) into v_secs
      from jsonb_array_elements(v_secs) with ordinality e(s, o)
     where not ((s->>'special')::boolean is true and jsonb_array_length(coalesce(s->'items', '[]'::jsonb)) = 0);
  else
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  update public.restaurants
     set menu_json = v_menu || jsonb_build_object('sections', coalesce(v_secs, '[]'::jsonb), 'updated_at', now())
   where id = p_restaurant_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.menu_special_edit(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.menu_special_edit(uuid, text, text, jsonb, text) to service_role;
