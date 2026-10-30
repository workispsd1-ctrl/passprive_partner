const FRESH_MS = 30 * 60 * 1000;

function ticketItems(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      name: String(l?.name || ""),
      qty: Number(l?.qty || 0),
      mods: Array.isArray(l?.modifiers) ? l.modifiers.map((m) => String(m?.name || "")).filter(Boolean) : [],
    }))
    .filter((l) => l.name && l.qty > 0);
}

export async function queueOrderTicket(admin, restaurantId, { orderId, tableNo, guests, lines, added, notes, source, needsAck = false }) {
  const items = ticketItems(lines);
  if (!items.length) return;
  const { error } = await admin.from("print_jobs").insert({
    restaurant_id: restaurantId,
    order_id: orderId || null,
    kind: added ? "added" : "order",
    source,
    needs_ack: needsAck,
    payload: { table_no: tableNo ?? null, guests: guests ?? null, notes: notes || null, items },
  });
  if (error) console.error("print_jobs insert failed", error.message);
}

export async function pendingPrintJobs(admin, restaurantId) {
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const { data, error } = await admin
    .from("print_jobs")
    .select("id, kind, payload, source, created_at")
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .eq("needs_ack", false)
    .or(`acked_at.gte.${since},and(acked_at.is.null,created_at.gte.${since})`)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw error;
  return data || [];
}

export async function claimPrintJob(admin, restaurantId, terminalId, jobId) {
  const { data, error } = await admin
    .from("print_jobs")
    .update({ printed_at: new Date().toISOString(), printed_by: terminalId })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function releasePrintJob(admin, restaurantId, terminalId, jobId) {
  const { error } = await admin
    .from("print_jobs")
    .update({ printed_at: null, printed_by: null })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .eq("printed_by", terminalId);
  if (error) throw error;
}

export function isQrPending(order) {
  return order?.order_details?.qr_pending === true || order?.qr_pending === true;
}

export async function heldQrOrders(admin, restaurantId) {
  const { data, error } = await admin
    .from("print_jobs")
    .select("id, order_id, kind, source, payload, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("needs_ack", true)
    .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  const jobs = data || [];
  const ids = [...new Set(jobs.map((j) => j.order_id).filter(Boolean))];
  const { data: orders, error: ordersErr } = ids.length
    ? await admin
        .from("restaurant_table_bookings")
        .select("id, customer_name, customer_phone, total_amount, payment_status, notes")
        .in("id", ids)
    : { data: [], error: null };
  if (ordersErr) throw ordersErr;
  const byId = new Map((orders || []).map((o) => [o.id, o]));
  return jobs.map((j) => ({ ...j, order: byId.get(j.order_id) || null }));
}

export async function ackQrOrder(admin, restaurantId, jobId, userId) {
  const { data, error } = await admin.rpc("ack_qr_job", { p_restaurant: restaurantId, p_job: jobId, p_by: userId || null });
  if (error) throw error;
  return data;
}
