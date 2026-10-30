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

export async function queueOrderTicket(admin, restaurantId, { orderId, tableNo, guests, lines, added, notes, source }) {
  const items = ticketItems(lines);
  if (!items.length) return;
  const { error } = await admin.from("print_jobs").insert({
    restaurant_id: restaurantId,
    order_id: orderId || null,
    kind: added ? "added" : "order",
    source,
    payload: { table_no: tableNo ?? null, guests: guests ?? null, notes: notes || null, items },
  });
  if (error) console.error("print_jobs insert failed", error.message);
}

export async function pendingPrintJobs(admin, restaurantId) {
  const { data, error } = await admin
    .from("print_jobs")
    .select("id, kind, payload, source, created_at")
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .gte("created_at", new Date(Date.now() - FRESH_MS).toISOString())
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
