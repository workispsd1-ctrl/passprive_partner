import { changeTable } from "@/lib/server/changeTable";
import { isBillClosed } from "@/lib/server/tableBill";

const STALE_MS = 2 * 60 * 1000;
const FIELDS =
  "id, order_id, ordered_by, from_table_no, from_area_id, guest_name, items, status, to_table_no, to_area_id, assigned_at, created_at, updated_at";
const fail = (status, error) => ({ status, body: { ok: false, error } });

export function visibleMoves(moves, areaId, userId, now = Date.now()) {
  const stale = (m) => m.status === "assigning" && now - new Date(m.updated_at).getTime() > STALE_MS;
  const toSeat = moves.filter((m) => (m.status === "waiting" || stale(m)) && (!areaId || m.from_area_id !== areaId));
  const mine = (m) => (m.ordered_by ? m.ordered_by === userId : !areaId || m.from_area_id === areaId);
  const notices = moves.filter((m) => (m.status === "assigned" || m.status === "serve_here") && mine(m));
  return { toSeat, notices };
}

async function layoutInfo(admin, restaurantId) {
  const [{ data: tables }, { data: areas }] = await Promise.all([
    admin.from("restaurant_table_layouts").select("table_no, label, area_id").eq("restaurant_id", restaurantId),
    admin.from("restaurant_table_areas").select("id, name, floor_label").eq("restaurant_id", restaurantId),
  ]);
  return {
    tables: new Map((tables || []).map((t) => [Number(t.table_no), t])),
    areas: new Map((areas || []).map((a) => [a.id, a])),
  };
}

function shape(m, info) {
  const fromArea = info.areas.get(m.from_area_id);
  const toTable = m.to_table_no != null ? info.tables.get(Number(m.to_table_no)) : null;
  const toArea = info.areas.get(m.to_area_id || toTable?.area_id);
  return {
    id: m.id,
    order_id: m.order_id,
    status: m.status === "assigning" ? "waiting" : m.status,
    guest_name: m.guest_name,
    items: Array.isArray(m.items) ? m.items : [],
    from: {
      table_no: m.from_table_no,
      label: info.tables.get(Number(m.from_table_no))?.label || `T${m.from_table_no}`,
      area: fromArea?.name || null,
      floor: fromArea?.floor_label || null,
    },
    to: toTable
      ? { table_no: m.to_table_no, label: toTable.label || `T${m.to_table_no}`, area: toArea?.name || null, floor: toArea?.floor_label || null }
      : null,
    since: m.created_at,
    assigned_at: m.assigned_at,
  };
}

export async function movesFor(admin, restaurantId, areaId, userId) {
  const { data, error } = await admin
    .from("guest_moves")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .in("status", ["waiting", "assigning", "assigned", "serve_here"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  const { toSeat, notices } = visibleMoves(data || [], areaId, userId);
  if (!toSeat.length && !notices.length) return { to_seat: [], notices: [] };
  const info = await layoutInfo(admin, restaurantId);
  return { to_seat: toSeat.map((m) => shape(m, info)), notices: notices.map((m) => shape(m, info)) };
}

async function lockMove(admin, restaurantId, moveId) {
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await admin
    .from("guest_moves")
    .update({ status: "assigning", updated_at: new Date().toISOString() })
    .eq("id", moveId)
    .eq("restaurant_id", restaurantId)
    .or(`status.eq.waiting,and(status.eq.assigning,updated_at.lt.${staleBefore})`)
    .select(FIELDS);
  if (error) throw error;
  return data?.[0] || null;
}

async function explainTaken(admin, restaurantId, moveId) {
  const { data } = await admin.from("guest_moves").select(FIELDS).eq("id", moveId).eq("restaurant_id", restaurantId).maybeSingle();
  if (!data) return fail(404, "This guest is no longer waiting.");
  if (data.status === "assigned") return fail(409, `Already seated at table ${data.to_table_no}.`);
  if (data.status === "serve_here") return fail(409, "Already being served at the bar.");
  if (data.status === "assigning") return fail(409, "Another waiter is seating this guest right now.");
  return fail(409, "This guest is no longer waiting.");
}

async function openOrder(admin, restaurantId, orderId) {
  const { data } = await admin
    .from("restaurant_table_bookings")
    .select("id, booking_status, payment_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return data && !isBillClosed(data) ? data : null;
}

export async function assignTable(admin, restaurantId, userId, body) {
  const moveId = String(body?.move_id || "");
  const toTable = Number(body?.to_table || 0);
  if (!moveId || !Number.isInteger(toTable) || toTable <= 0) return fail(400, "Pick a table.");
  const move = await lockMove(admin, restaurantId, moveId);
  if (!move) return explainTaken(admin, restaurantId, moveId);
  const release = () =>
    admin.from("guest_moves").update({ status: "waiting", updated_at: new Date().toISOString() }).eq("id", move.id).eq("status", "assigning");

  if (!(await openOrder(admin, restaurantId, move.order_id))) {
    await admin.from("guest_moves").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", move.id);
    return fail(409, "This bill is already closed.");
  }
  const moved = await changeTable(admin, restaurantId, userId, { order_id: move.order_id, to_table: toTable });
  if (!moved.body.ok) {
    await release();
    return moved;
  }
  const { data: layout } = await admin
    .from("restaurant_table_layouts")
    .select("area_id")
    .eq("restaurant_id", restaurantId)
    .eq("table_no", moved.body.table_no)
    .maybeSingle();
  const at = new Date().toISOString();
  await admin
    .from("guest_moves")
    .update({
      status: "assigned",
      to_table_no: moved.body.table_no,
      to_area_id: layout?.area_id || null,
      assigned_by: userId,
      assigned_at: at,
      updated_at: at,
    })
    .eq("id", move.id);
  return { status: 200, body: { ok: true, mode: moved.body.mode, table_no: moved.body.table_no } };
}

export async function serveHere(admin, restaurantId, userId, body) {
  const moveId = String(body?.move_id || "");
  const move = await lockMove(admin, restaurantId, moveId);
  if (!move) return explainTaken(admin, restaurantId, moveId);
  const at = new Date().toISOString();
  await admin
    .from("guest_moves")
    .update({ status: "serve_here", assigned_by: userId, assigned_at: at, updated_at: at })
    .eq("id", move.id);
  return { status: 200, body: { ok: true } };
}

export async function acknowledge(admin, restaurantId, userId, body) {
  const moveId = String(body?.move_id || "");
  const at = new Date().toISOString();
  const { data, error } = await admin
    .from("guest_moves")
    .update({ status: "done", acked_by: userId, acked_at: at, updated_at: at })
    .eq("id", moveId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["assigned", "serve_here"])
    .or(`ordered_by.is.null,ordered_by.eq.${userId}`)
    .select("id");
  if (error) return fail(400, error.message);
  return { status: 200, body: { ok: true, already: !data?.length } };
}
