import { isQrPending } from "@/lib/server/printJobs";

const FIELDS = "id, opened_at, opened_by, closed_at, closed_by";
const PICKUP_DAYS = 7;
const REQUEST_HOURS = 6;

export async function currentDay(admin, restaurantId) {
  const { data, error } = await admin
    .from("restaurant_business_days")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function lastClosedDay(admin, restaurantId) {
  const { data, error } = await admin
    .from("restaurant_business_days")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function openDay(admin, restaurantId, userId) {
  const open = await currentDay(admin, restaurantId);
  if (open) return { status: 200, body: { ok: true, day: open, already: true } };
  const { data, error } = await admin
    .from("restaurant_business_days")
    .insert({ restaurant_id: restaurantId, opened_by: userId || null })
    .select(FIELDS)
    .single();
  if (error?.code === "23505") return { status: 200, body: { ok: true, day: await currentDay(admin, restaurantId), already: true } };
  if (error) throw error;
  return { status: 200, body: { ok: true, day: data } };
}

export function openBills(rows) {
  return (rows || [])
    .filter((r) => !isQrPending(r))
    .map((r) => ({ id: r.id, table_no: Number(r.table_no), customer_name: r.customer_name || null, total: Number(r.total_amount || 0) }))
    .sort((a, b) => a.table_no - b.table_no);
}

export async function closeBlockers(admin, restaurantId) {
  const pickupSince = new Date(Date.now() - PICKUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const requestSince = new Date(Date.now() - REQUEST_HOURS * 60 * 60 * 1000).toISOString();
  const [tablesRes, pickupsRes, requestsRes, layoutRes] = await Promise.all([
    admin
      .from("restaurant_table_bookings")
      .select("id, table_no, customer_name, total_amount, order_details, booking_status, payment_status")
      .eq("restaurant_id", restaurantId)
      .not("booking_status", "in", "(CANCELLED,PAID)")
      .not("payment_status", "in", "(PAID,COMPLETED)")
      .limit(200),
    admin
      .from("restaurant_orders")
      .select("id, order_number, pickup_code, customer_name, total_amount")
      .eq("restaurant_id", restaurantId)
      .neq("order_status", "CANCELLED")
      .neq("payment_status", "PAID")
      .gte("created_at", pickupSince)
      .limit(200),
    admin
      .from("pos_payment_requests")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .gte("created_at", requestSince)
      .limit(50),
    admin.from("restaurant_table_layouts").select("table_no, label").eq("restaurant_id", restaurantId),
  ]);
  for (const res of [tablesRes, pickupsRes, requestsRes, layoutRes]) if (res.error) throw res.error;
  const labels = new Map((layoutRes.data || []).map((t) => [Number(t.table_no), t.label || `T${t.table_no}`]));
  const tables = openBills(tablesRes.data).map((b) => ({ ...b, label: labels.get(b.table_no) || `T${b.table_no}` }));
  const pickups = (pickupsRes.data || []).map((o) => ({ id: o.id, code: o.pickup_code || o.order_number || "", customer_name: o.customer_name || null, total: Number(o.total_amount || 0) }));
  const posWaiting = (requestsRes.data || []).length;
  return { tables, pickups, pos_waiting: posWaiting, ready: !tables.length && !pickups.length && !posWaiting };
}

export async function markClosed(admin, restaurantId, day, userId, report) {
  const { data, error } = await admin
    .from("restaurant_business_days")
    .update({ closed_at: new Date().toISOString(), closed_by: userId || null, report })
    .eq("id", day.id)
    .eq("restaurant_id", restaurantId)
    .is("closed_at", null)
    .select(FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
