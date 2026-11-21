import { menuAreas, sectionPlace } from "@/lib/menuAreas";

const FRESH_MS = 30 * 60 * 1000;
const LAN_FRESH_MS = 10 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const leaseCutoff = () => new Date(Date.now() - LEASE_MS).toISOString();

function ticketItems(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      item_id: l?.item_id ? String(l.item_id) : null,
      name: String(l?.name || ""),
      qty: Number(l?.qty || 0),
      mods: Array.isArray(l?.modifiers) ? l.modifiers.map((m) => String(m?.name || "")).filter(Boolean) : [],
      note: l?.note ? String(l.note) : null,
    }))
    .filter((l) => l.name && l.qty > 0);
}

async function insertJob(admin, row) {
  let { error } = await admin.from("print_jobs").insert(row);
  if (error) ({ error } = await admin.from("print_jobs").insert(row));
  if (error) console.error("print_jobs insert failed", error.message);
}

const printerInfo = (p) => ({ id: p.id, name: p.name, ip: p.ip, port: p.port, paper_mm: p.paper_mm });

export async function activePrinters(admin, restaurantId) {
  const { data } = await admin
    .from("restaurant_printers")
    .select("id, name, ip, port, paper_mm, prints, backup_printer_id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return data || [];
}

export async function lanDeviceOnline(admin, restaurantId) {
  const since = new Date(Date.now() - LAN_FRESH_MS).toISOString();
  const { data } = await admin
    .from("pos_terminals")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .gte("lan_print_at", since)
    .limit(1);
  return Boolean(data?.length);
}

async function itemStations(admin, restaurantId) {
  const { data } = await admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle();
  let menu = data?.menu_json;
  if (typeof menu === "string") {
    try {
      menu = JSON.parse(menu);
    } catch {
      menu = null;
    }
  }
  const areas = menuAreas(menu);
  const map = new Map();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    const station = sectionPlace(areas, section).kind === "Bar" ? "bar" : "kitchen";
    for (const item of Array.isArray(section?.items) ? section.items : []) if (item?.id) map.set(String(item.id), station);
  }
  return map;
}

export function splitByStation(items, stations) {
  const out = { kitchen: [], bar: [] };
  for (const it of items) out[stations.get(String(it.item_id)) === "bar" ? "bar" : "kitchen"].push(it);
  return out;
}

export const mainPrinter = (printers) => printers.find((p) => p.prints.includes("receipts")) || null;

async function routeTicket(admin, restaurantId, row, printers) {
  const main = mainPrinter(printers);
  const ticketPrinters = printers.filter((p) => p.prints.includes("kitchen") || p.prints.includes("bar"));
  if (!ticketPrinters.length) {
    return insertJob(admin, main ? { ...row, printer_id: main.id, payload: { ...row.payload, printer: printerInfo(main) } } : row);
  }
  const groups = splitByStation(row.payload.items, await itemStations(admin, restaurantId));
  for (const station of ["kitchen", "bar"]) {
    const items = groups[station];
    if (!items.length) continue;
    const found = ticketPrinters.filter((p) => p.prints.includes(station));
    const targets = found.length ? found : main ? [main] : [];
    if (!targets.length) {
      await insertJob(admin, { ...row, payload: { ...row.payload, items, station } });
      continue;
    }
    for (const p of targets) {
      await insertJob(admin, { ...row, printer_id: p.id, payload: { ...row.payload, items, station, printer: printerInfo(p) } });
    }
  }
}

async function ticketWhere(admin, restaurantId, tableNo, orderId) {
  const [{ data: table }, { data: order }] = await Promise.all([
    tableNo
      ? admin
          .from("restaurant_table_layouts")
          .select("label, restaurant_table_areas!restaurant_table_layouts_area_fk(name, floor_label, guests_move_for_food)")
          .eq("restaurant_id", restaurantId)
          .eq("table_no", tableNo)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    orderId
      ? admin.from("restaurant_table_bookings").select("customer_name").eq("id", orderId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const area = Array.isArray(table?.restaurant_table_areas) ? table.restaurant_table_areas[0] : table?.restaurant_table_areas;
  const guest = String(order?.customer_name || "").trim();
  return {
    table_label: table?.label || null,
    area_name: area?.name || null,
    floor: area?.floor_label || null,
    from_moving_area: area?.guests_move_for_food === true,
    guest_name: guest && !/^staff order$/i.test(guest) ? guest.slice(0, 40) : null,
  };
}

export async function queueOrderTicket(admin, restaurantId, { orderId, tableNo, guests, lines, added, notes, source, needsAck = false }) {
  const items = ticketItems(lines);
  if (!items.length) return;
  const where = await ticketWhere(admin, restaurantId, tableNo, orderId);
  const row = {
    restaurant_id: restaurantId,
    order_id: orderId || null,
    kind: added ? "added" : "order",
    source,
    needs_ack: needsAck,
    payload: { table_no: tableNo ?? null, guests: guests ?? null, notes: notes || null, items, ...where },
  };
  if (needsAck) return insertJob(admin, row);
  return routeTicket(admin, restaurantId, row, await activePrinters(admin, restaurantId));
}

export async function queueTestPrint(admin, restaurantId, printer, by) {
  return insertJob(admin, {
    restaurant_id: restaurantId,
    kind: "test",
    source: "Partner dashboard",
    needs_ack: false,
    printer_id: printer.id,
    payload: { printer: printerInfo(printer), by: by || null, prints: printer.prints || [] },
  });
}

export const TICKET_KINDS = ["order", "added"];
export const RECEIPT_KINDS = ["bill", "part_receipt", "final_bill"];

export async function queueReceiptJob(admin, restaurantId, { orderId, kind, payload, source }) {
  const [printers, { data: merchant }] = await Promise.all([
    activePrinters(admin, restaurantId),
    admin.from("restaurants").select("name, registered_name, brn, full_address, phone").eq("id", restaurantId).maybeSingle(),
  ]);
  const full = { ...payload, merchant: merchant || null };
  const row = { restaurant_id: restaurantId, order_id: orderId || null, kind, source: source || "Partner app", needs_ack: false, payload: full };
  const target = mainPrinter(printers);
  return insertJob(admin, target ? { ...row, printer_id: target.id, payload: { ...full, printer: printerInfo(target) } } : row);
}

const BILL_COLUMNS = "id, table_no, guest_count, customer_name, order_items, total_amount, order_details";

async function billRow(admin, restaurantId, orderId) {
  if (!orderId) return null;
  const { data } = await admin.from("restaurant_table_bookings").select(BILL_COLUMNS).eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle();
  return data || null;
}

async function alreadyQueued(admin, restaurantId, orderId, kind, key, withinMs) {
  let query = admin
    .from("print_jobs")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("kind", kind)
    .eq("payload->>print_key", key);
  if (withinMs) query = query.gte("created_at", new Date(Date.now() - withinMs).toISOString());
  const { data } = await query.limit(1);
  return Boolean(data?.length);
}

async function queueOnce(admin, restaurantId, row, kind, key, payload, withinMs = 0) {
  if (await alreadyQueued(admin, restaurantId, row.id, kind, key, withinMs)) return;
  await queueReceiptJob(admin, restaurantId, { orderId: row.id, kind, payload: { ...payload, print_key: key } });
}

const billHead = (row) => ({
  order_id: row.id,
  table_no: row.table_no,
  guests: row.guest_count,
  customer_name: row.customer_name || null,
  bill_total: Number(row.total_amount || 0),
});

export async function queueBillPrint(admin, restaurantId, orderId) {
  const row = await billRow(admin, restaurantId, orderId);
  if (!row || !(row.order_items || []).length) return;
  await queueOnce(admin, restaurantId, row, "bill", "bill", { ...billHead(row), items: row.order_items }, 20000);
}

export async function queueFinalPrint(admin, restaurantId, orderId) {
  const row = await billRow(admin, restaurantId, orderId);
  const pay = row?.order_details?.payment;
  if (!row || !pay) return;
  const split = row.order_details?.payments;
  const parts = Array.isArray(split) && split.length
    ? split
    : [{
        no: 1,
        method: pay.method,
        amount: Number(pay.amount_due || 0),
        tip: Number(pay.tip || 0),
        received: Number(pay.amount_received || 0),
        change: Number(pay.change || 0),
        reference: pay.reference || null,
        gateway: pay.gateway ? { last4: pay.gateway.last4 || null } : null,
      }];
  await queueOnce(admin, restaurantId, row, "final_bill", "final", { ...billHead(row), items: row.order_items || [], payments: parts });
}

export async function queuePartPrint(admin, restaurantId, orderId, out) {
  if (out?.closed) return queueFinalPrint(admin, restaurantId, orderId);
  const row = await billRow(admin, restaurantId, orderId);
  if (!row || !out?.part) return;
  const paid = (out.payments || []).reduce((n, p) => n + Math.round(Number(p.amount || 0) * 100), 0);
  await queueOnce(admin, restaurantId, row, "part_receipt", `part:${out.part.no}`, { ...billHead(row), part: out.part, paid_so_far: paid / 100 });
}

export async function pendingPrintJobs(admin, restaurantId, kinds = TICKET_KINDS, lan = false) {
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const cut = leaseCutoff();
  let query = admin
    .from("print_jobs")
    .select("id, kind, payload, source, created_at, printer_id")
    .eq("restaurant_id", restaurantId);
  if (!lan || !kinds?.length) return [];
  query = query.not("printer_id", "is", null);
  const { data, error } = await query
    .is("printed_at", null)
    .eq("needs_ack", false)
    .in("kind", kinds)
    .or(
      `and(acked_at.gte.${since},or(leased_at.is.null,leased_at.lt.${cut})),and(acked_at.is.null,created_at.gte.${since},or(leased_at.is.null,leased_at.lt.${cut}))`
    )
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

export async function leasePrintJob(admin, restaurantId, terminalId, jobId) {
  const { data, error } = await admin
    .from("print_jobs")
    .update({ leased_at: new Date().toISOString(), leased_by: terminalId })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .or(`leased_at.is.null,leased_at.lt.${leaseCutoff()}`)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function confirmPrintJob(admin, restaurantId, terminalId, jobId, viaPrinterId = null) {
  let printedPrinterId = null;
  if (/^[0-9a-f-]{36}$/i.test(String(viaPrinterId || ""))) {
    const { data } = await admin
      .from("restaurant_printers")
      .select("id")
      .eq("id", viaPrinterId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    printedPrinterId = data?.id || null;
  }
  const { error } = await admin
    .from("print_jobs")
    .update({ printed_at: new Date().toISOString(), printed_by: terminalId, printed_printer_id: printedPrinterId })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null);
  if (error) throw error;
}

export async function unleasePrintJob(admin, restaurantId, terminalId, jobId) {
  const { error } = await admin
    .from("print_jobs")
    .update({ leased_at: null, leased_by: null })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .eq("leased_by", terminalId)
    .is("printed_at", null);
  if (error) throw error;
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
  const printers = await activePrinters(admin, restaurantId);
  if (printers.some((p) => p.prints.includes("kitchen") || p.prints.includes("bar") || p.prints.includes("receipts"))) {
    const { data: job } = await admin
      .from("print_jobs")
      .select("id, order_id, kind, source, payload, printer_id, printed_at, acked_at")
      .eq("id", jobId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (job && !job.printer_id && !job.printed_at && !job.acked_at && TICKET_KINDS.includes(job.kind)) {
      await routeTicket(admin, restaurantId, {
        restaurant_id: restaurantId,
        order_id: job.order_id,
        kind: job.kind,
        source: job.source,
        needs_ack: false,
        payload: job.payload,
      }, printers);
      await admin.from("print_jobs").update({ printed_at: new Date().toISOString() }).eq("id", job.id).is("printed_at", null);
    }
  }
  const { data, error } = await admin.rpc("ack_qr_job", { p_restaurant: restaurantId, p_job: jobId, p_by: userId || null });
  if (error) throw error;
  return data;
}
