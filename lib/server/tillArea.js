const UUID = /^[0-9a-f-]{36}$/i;

const areaOf = (row) => {
  const a = Array.isArray(row?.restaurant_table_areas) ? row.restaurant_table_areas[0] : row?.restaurant_table_areas;
  return row?.area_id && a?.id ? { id: a.id, name: a.name || "" } : null;
};

export async function tillArea(admin, { restaurantId, userId, terminalId }) {
  const [{ data: staffRow }, { data: terminalRow }] = await Promise.all([
    admin
      .from("restaurant_staff")
      .select("area_id, restaurant_table_areas:area_id(id, name)")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    terminalId
      ? admin.from("pos_terminals").select("area_id, restaurant_table_areas:area_id(id, name)").eq("id", terminalId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return areaOf(staffRow) || areaOf(terminalRow);
}

export function venueOf(areaRows, areaId) {
  const rows = areaRows || [];
  const me = rows.find((a) => a.id === areaId);
  const menuAreaId = me?.menu_area_id || null;
  const ids = new Set(menuAreaId ? rows.filter((a) => a.menu_area_id === menuAreaId).map((a) => a.id) : [areaId]);
  ids.add(areaId);
  return { ids, menuAreaId };
}

export async function staffVenue(admin, ctx) {
  const area = await tillArea(admin, ctx);
  if (!area) return null;
  const { data, error } = await admin.from("restaurant_table_areas").select("id, menu_area_id").eq("restaurant_id", ctx.restaurantId);
  if (error) throw error;
  return { area, ...venueOf(data, area.id) };
}

export async function areaTableNos(admin, restaurantId, areaId) {
  const [{ data, error }, { data: areaRows }] = await Promise.all([
    admin.from("restaurant_table_layouts").select("id, table_no, area_id, attached_to").eq("restaurant_id", restaurantId),
    admin.from("restaurant_table_areas").select("id, menu_area_id").eq("restaurant_id", restaurantId),
  ]);
  if (error) throw error;
  const { ids } = venueOf(areaRows, areaId);
  const rows = data || [];
  const byId = new Map(rows.map((t) => [t.id, t]));
  const inArea = new Set(
    rows.filter((t) => ids.has(((t.attached_to && byId.get(t.attached_to)) || t).area_id)).map((t) => Number(t.table_no))
  );
  const onPlan = new Set(rows.map((t) => Number(t.table_no)));
  return { has: (no) => inArea.has(Number(no)) || !onPlan.has(Number(no)) };
}

export async function scopeForTill(admin, ctx, requestedAreaId) {
  const forced = await tillArea(admin, ctx);
  const { data: areaRows } = await admin
    .from("restaurant_table_areas")
    .select("id, name, sort_order")
    .eq("restaurant_id", ctx.restaurantId)
    .order("sort_order", { ascending: true });
  const areas = (areaRows || []).map((a) => ({ id: a.id, name: a.name }));
  const asked = UUID.test(String(requestedAreaId || "")) ? areas.find((a) => a.id === requestedAreaId) : null;
  const area = forced || asked || null;
  return {
    area,
    locked: Boolean(forced),
    areas: forced ? [forced] : areas,
    tableNos: area ? await areaTableNos(admin, ctx.restaurantId, area.id) : null,
  };
}

export function inScope(scope, tableNo) {
  return !scope?.tableNos || scope.tableNos.has(Number(tableNo));
}
