import { logoStamp } from "@/lib/server/receiptLogo";
import { menuAreas, sectionPlace } from "@/lib/menuAreas";

const FRESH_MS = 2 * 60 * 60 * 1000;
const RETRY_MS = 20 * 1000;
const LAN_FRESH_MS = 10 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const leaseCutoff = () => new Date(Date.now() - LEASE_MS).toISOString();

export function ticketItems(lines, labels = new Map()) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => {
      const variant = l?.variant?.name ? String(l.variant.name) : null;
      const full = String(l?.name || "");
      const label = labels.get(String(l?.item_id || ""));
      const base = label || (variant && full.endsWith(` – ${variant}`) ? full.slice(0, -(variant.length + 3)) : full);
      return {
      item_id: l?.item_id ? String(l.item_id) : null,
      name: base,
      ...(variant ? { variant } : {}),
      qty: Number(l?.qty || 0),
      mods: Array.isArray(l?.modifiers) ? l.modifiers.map((m) => String(m?.name || "")).filter(Boolean) : [],
      note: l?.note ? String(l.note) : null,
      guest: l?.guest ? String(l.guest) : null,
      };
    })
    .filter((l) => l.name && l.qty > 0);
}

async function insertJob(admin, row) {
  let { error } = await admin.from("print_jobs").insert(row);
  if (error) ({ error } = await admin.from("print_jobs").insert(row));
  if (error) console.error("print_jobs insert failed", error.message);
}

const printerInfo = (p) => ({ id: p.id, name: p.name, ip: p.ip, port: p.port, paper_mm: p.paper_mm, bottom_feed_mm: p.bottom_feed_mm || 0 });

export async function activePrinters(admin, restaurantId) {
  const { data } = await admin
    .from("restaurant_printers")
    .select("id, name, ip, port, paper_mm, prints, backup_printer_id, bottom_feed_mm")
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

async function menuInfo(admin, restaurantId) {
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
  const stations = new Map();
  const labels = new Map();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    const station = sectionPlace(areas, section).kind === "Bar" ? "bar" : "kitchen";
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      if (!item?.id) continue;
      stations.set(String(item.id), station);
      const label = String(item.kitchen_label || "").trim().slice(0, 40);
      if (label) labels.set(String(item.id), label);
    }
  }
  return { stations, labels };
}

export function splitByStation(items, stations) {
  const out = { kitchen: [], bar: [] };
  for (const it of items) out[stations.get(String(it.item_id)) === "bar" ? "bar" : "kitchen"].push(it);
  return out;
}

export const mainPrinter = (printers) => printers.find((p) => p.prints.includes("receipts")) || null;

async function routeTicket(admin, restaurantId, row, printers, stations) {
  const main = mainPrinter(printers);
  const ticketPrinters = printers.filter((p) => p.prints.includes("kitchen") || p.prints.includes("bar"));
  if (!ticketPrinters.length) {
    return insertJob(admin, main ? { ...row, printer_id: main.id, payload: { ...row.payload, printer: printerInfo(main) } } : row);
  }
  const groups = splitByStation(row.payload.items, stations || (await menuInfo(admin, restaurantId)).stations);
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

const WAITER_ROLES = ["restaurant_waiter", "restaurant_bearer", "waiter"];

export async function staffName(admin, restaurantId, userId) {
  if (!userId) return null;
  const [{ data: user }, { data: staff }] = await Promise.all([
    admin.from("users").select("full_name").eq("id", userId).maybeSingle(),
    admin.from("restaurant_staff").select("role").eq("restaurant_id", restaurantId).eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  const name = String(user?.full_name || "").trim().slice(0, 30);
  return name ? { name, waiter: WAITER_ROLES.includes(String(staff?.role || "").toLowerCase()) } : null;
}

export async function queueOrderTicket(admin, restaurantId, { orderId, tableNo, guests, lines, added, notes, source, needsAck = false, takeaway = null, by = null, cancel = false }) {
  const menu = await menuInfo(admin, restaurantId).catch(() => ({ stations: new Map(), labels: new Map() }));
  const items = ticketItems(lines, menu.labels);
  if (!items.length) return;
  const [where, staff, logoAt] = await Promise.all([
    ticketWhere(admin, restaurantId, tableNo, orderId),
    staffName(admin, restaurantId, by).catch(() => null),
    logoStamp(admin, restaurantId).catch(() => null),
  ]);
  const row = {
    restaurant_id: restaurantId,
    order_id: orderId || null,
    kind: cancel ? "cancel" : added ? "added" : "order",
    source,
    needs_ack: needsAck,
    payload: { table_no: tableNo ?? null, guests: guests ?? null, notes: notes || null, items, ...where, ...(staff ? { staff_name: staff.name, staff_waiter: staff.waiter } : {}), ...(takeaway ? { takeaway } : {}), ...(logoAt ? { logo_at: logoAt } : {}) },
  };
  if (needsAck) return insertJob(admin, row);
  return routeTicket(admin, restaurantId, row, await activePrinters(admin, restaurantId), menu.stations);
}

export async function queueTestPrint(admin, restaurantId, printer, by) {
  const logoAt = await logoStamp(admin, restaurantId).catch(() => null);
  return insertJob(admin, {
    restaurant_id: restaurantId,
    kind: "test",
    source: "Partner dashboard",
    needs_ack: false,
    printer_id: printer.id,
    payload: { printer: printerInfo(printer), by: by || null, prints: printer.prints || [], ...(logoAt ? { logo_at: logoAt } : {}) },
  });
}

export const TICKET_KINDS = ["order", "added", "cancel"];
export const RECEIPT_KINDS = ["bill", "part_receipt", "final_bill", "report"];

export async function queueReceiptJob(admin, restaurantId, { orderId, kind, payload, source, held = false }) {
  const [printers, { data: merchant }, logoAt] = await Promise.all([
    activePrinters(admin, restaurantId),
    admin.from("restaurants").select("name, registered_name, brn, vat_number, full_address, phone").eq("id", restaurantId).maybeSingle(),
    logoStamp(admin, restaurantId).catch(() => null),
  ]);
  const full = { ...payload, merchant: merchant || null, ...(logoAt ? { logo_at: logoAt } : {}), ...(held ? { held: true } : {}) };
  const row = { restaurant_id: restaurantId, order_id: orderId || null, kind, source: source || "Partner app", needs_ack: false, payload: full, ...(held ? { dismissed_at: new Date().toISOString(), dismissed_by: "not_auto_printed" } : {}) };
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

async function queueOnce(admin, restaurantId, row, kind, key, payload, withinMs = 0, held = false) {
  if (await alreadyQueued(admin, restaurantId, row.id, kind, key, withinMs)) return;
  await queueReceiptJob(admin, restaurantId, { orderId: row.id, kind, payload: { ...payload, print_key: key }, held });
}

const billHead = (row) => ({
  order_id: row.id,
  table_no: row.table_no,
  guests: row.guest_count,
  customer_name: row.customer_name || null,
  bill_total: Number(row.total_amount || 0),
  ...(row.order_details?.bill_discount ? { bill_discount: { pct: Number(row.order_details.bill_discount.pct || 0) || null, amount: Number(row.order_details.bill_discount.amount || 0) || null } } : {}),
});

export async function queueBillPrint(admin, restaurantId, orderId) {
  const row = await billRow(admin, restaurantId, orderId);
  if (!row || !(row.order_items || []).length) return;
  const parts = Array.isArray(row.order_details?.payments) ? row.order_details.payments : [];
  const deposit = parts.filter((p) => String(p?.method || "").toUpperCase() === "DEPOSIT").reduce((n, p) => n + Math.round(Number(p.amount || 0) * 100), 0);
  await queueOnce(admin, restaurantId, row, "bill", "bill", { ...billHead(row), items: row.order_items, ...(deposit > 0 ? { deposit_paid: deposit / 100 } : {}) }, 20000);
}

export async function queueShareBillPrint(admin, restaurantId, orderId, request) {
  if (!request?.id || !Array.isArray(request.items) || !request.items.length) return;
  const row = await billRow(admin, restaurantId, orderId);
  if (!row) return;
  const lines = Array.isArray(row.order_items) ? row.order_items : [];
  const items = request.items.map((it) => {
    const line = lines.find((l) => l.line_key === it.line_key) || { name: it.name };
    const unit = Number(line.unit_price || 0);
    const qty = Number(it.qty || 0);
    return { ...line, qty, unit_price: unit, line_total: Number((unit * qty).toFixed(2)) };
  });
  await queueOnce(admin, restaurantId, row, "bill", `share:${request.id}`, {
    ...billHead(row),
    bill_total: Number(request.amount || 0),
    guest: request.guest || null,
    items,
  });
}

async function invoiceInfo(admin, restaurantId, kind, id, cashierId) {
  const [{ data: invoiceNo }, { count }, servedJob, cashier] = await Promise.all([
    admin.rpc("assign_invoice_no", { p_kind: kind, p_id: id }),
    admin.from("print_jobs").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("order_id", id).eq("kind", "final_bill"),
    admin.from("print_jobs").select("payload").eq("restaurant_id", restaurantId).eq("order_id", id).eq("kind", "order").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    staffName(admin, restaurantId, cashierId).catch(() => null),
  ]);
  return {
    ...(invoiceNo ? { invoice_no: Number(invoiceNo) } : {}),
    print_count: Number(count || 0) + 1,
    ...(servedJob?.data?.payload?.staff_name ? { served_by: servedJob.data.payload.staff_name } : {}),
    ...(cashier?.name ? { cashier: cashier.name } : {}),
  };
}

export async function queueTakeawayReceipt(admin, restaurantId, order, payment) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!order?.id || !items.length) return;
  const total = Number(order.total_amount || 0);
  await queueReceiptJob(admin, restaurantId, {
    kind: "final_bill",
    source: "Takeaway",
    payload: {
      order_id: order.id,
      takeaway: { name: order.customer_name || null, code: order.pickup_code || null, number: order.order_number || null },
      customer_name: order.customer_name || null,
      bill_total: total,
      items,
      payments: [{ no: 1, method: payment.method, amount: total, tip: 0, received: payment.received ?? total, change: payment.change ?? 0, reference: payment.reference || null }],
      ...(payment.corrected ? { corrected: true } : {}),
      ...(await invoiceInfo(admin, restaurantId, "pickup", order.id, payment.by || null)),
    },
    held: !payment.corrected,
  });
}

export async function queueFinalPrint(admin, restaurantId, orderId, { corrected = false, cancelled = null } = {}) {
  const row = await billRow(admin, restaurantId, orderId);
  const pay = row?.order_details?.payment;
  if (!row || !pay) return;
  const split = row.order_details?.payments;
  const parts = Array.isArray(split) && split.length
    ? split
    : Array.isArray(pay.split) && pay.split.length
    ? pay.split.map((p, i) => ({ no: i + 1, method: p.method, amount: Number(p.amount || 0), tip: 0, received: Number(p.amount || 0), change: 0, reference: null }))
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
  const reopened = Array.isArray(row.order_details?.reopened) ? row.order_details.reopened.length : 0;
  const fixes = Array.isArray(row.order_details?.corrections) ? row.order_details.corrections.length : 0;
  const key = cancelled ? "final:void" : corrected ? `final:c${fixes}` : reopened ? `final:r${reopened}` : "final";
  const cashierId = pay.by || (Array.isArray(split) && split.length ? split[split.length - 1]?.by : null) || null;
  const invoice = await invoiceInfo(admin, restaurantId, "table", row.id, cashierId);
  await queueOnce(admin, restaurantId, row, "final_bill", key, {
    ...billHead(row),
    ...invoice,
    items: row.order_items || [],
    payments: parts,
    ...(corrected ? { corrected: true } : {}),
    ...(cancelled ? { cancelled } : {}),
  }, 0, !corrected && !cancelled);
  return invoice;
}

export async function queuePartPrint(admin, restaurantId, orderId, out) {
  if (out?.closed) return queueFinalPrint(admin, restaurantId, orderId);
  const row = await billRow(admin, restaurantId, orderId);
  if (!row || !out?.part) return;
  const paid = (out.payments || []).reduce((n, p) => n + Math.round(Number(p.amount || 0) * 100), 0);
  await queueOnce(admin, restaurantId, row, "part_receipt", `part:${out.part.no}`, { ...billHead(row), part: out.part, paid_so_far: paid / 100 });
}

export async function pendingPrintJobs(admin, restaurantId, kinds = TICKET_KINDS, lan = false, { minAgeMs = 0 } = {}) {
  if (!lan || !kinds?.length) return [];
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const cut = leaseCutoff();
  const retry = new Date(Date.now() - RETRY_MS).toISOString();
  let query = admin
    .from("print_jobs")
    .select("id, kind, payload, source, created_at, printer_id")
    .eq("restaurant_id", restaurantId)
    .not("printer_id", "is", null)
    .is("printed_at", null)
    .is("dismissed_at", null)
    .eq("needs_ack", false)
    .in("kind", kinds)
    .or(
      `and(acked_at.gte.${since},or(leased_at.is.null,leased_at.lt.${cut}),or(failed_at.is.null,failed_at.lt.${retry})),and(acked_at.is.null,created_at.gte.${since},or(leased_at.is.null,leased_at.lt.${cut}),or(failed_at.is.null,failed_at.lt.${retry}))`
    );
  if (minAgeMs > 0) query = query.lt("created_at", new Date(Date.now() - minAgeMs).toISOString());
  const { data, error } = await query.order("created_at", { ascending: true }).limit(30);
  if (error) throw error;
  return data || [];
}

const KIND_LABEL = { order: "order", added: "added", cancel: "cancel", bill: "bill", part_receipt: "part_receipt", final_bill: "final_bill", report: "report", test: "test" };

export async function printHistory(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("print_jobs")
    .select("id, kind, payload, source, created_at, printed_at, leased_at, attempts, failed_at, last_error, printer_id, printed_printer_id, dismissed_by")
    .eq("restaurant_id", restaurantId)
    .or(`order_id.eq.${orderId},payload->>order_id.eq.${orderId}`)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const printers = await activePrinters(admin, restaurantId).catch(() => []);
  const nameOf = (id) => printers.find((p) => p.id === id)?.name || null;
  return (data || [])
    .filter((j) => KIND_LABEL[j.kind] && j.kind !== "test")
    .map((j) => ({
      id: j.id,
      kind: j.kind,
      station: j.payload?.station || null,
      created_at: j.created_at,
      printed_at: j.printed_at,
      printer: nameOf(j.printed_printer_id) || j.payload?.printer?.name || nameOf(j.printer_id),
      status: j.printed_at ? "printed" : j.dismissed_by === "not_auto_printed" ? "saved" : j.failed_at && j.attempts > 0 ? "failed" : j.printer_id ? "waiting" : "no_printer",
      attempts: j.attempts || 0,
      error: j.last_error || null,
      reprint: Boolean(j.payload?.reprint),
      items: Array.isArray(j.payload?.items) ? j.payload.items.reduce((n, i) => n + Number(i?.qty || 0), 0) : 0,
      total: j.payload?.bill_total ?? null,
      guest: j.payload?.guest || j.payload?.part?.guest || null,
    }));
}

export async function reprintJob(admin, restaurantId, jobId, terminalId) {
  const { data: job, error } = await admin
    .from("print_jobs")
    .select("id, order_id, kind, payload, source, printer_id")
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!job) return { ok: false, error: "not_found" };
  const printers = await activePrinters(admin, restaurantId);
  const station = job.payload?.station;
  const target =
    printers.find((p) => p.id === job.printer_id) ||
    (TICKET_KINDS.includes(job.kind) && station ? printers.find((p) => p.prints.includes(station)) : null) ||
    mainPrinter(printers) ||
    printers[0] ||
    null;
  if (!target) return { ok: false, error: "That printer is no longer set up. Check Printers on the partner dashboard." };
  const payload = { ...(job.payload || {}) };
  delete payload.print_key;
  delete payload.reprint;
  const firstPrint = Boolean(payload.held);
  delete payload.held;
  const logoAt = await logoStamp(admin, restaurantId).catch(() => null);
  await insertJob(admin, {
    restaurant_id: restaurantId,
    order_id: job.order_id,
    kind: job.kind,
    source: job.source,
    needs_ack: false,
    printer_id: target.id,
    payload: { ...payload, printer: printerInfo(target), ...(firstPrint ? {} : { reprint: { of: job.id, at: new Date().toISOString(), by: terminalId || null } }), ...(logoAt ? { logo_at: logoAt } : {}) },
  });
  await admin
    .from("print_jobs")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: "reprinted" })
    .eq("id", job.id)
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .is("dismissed_at", null);
  return { ok: true };
}

export async function failPrintJob(admin, restaurantId, terminalId, jobId, reason) {
  const { data } = await admin.from("print_jobs").select("attempts").eq("id", jobId).eq("restaurant_id", restaurantId).maybeSingle();
  const { error } = await admin
    .from("print_jobs")
    .update({ leased_at: null, leased_by: null, attempts: Number(data?.attempts || 0) + 1, failed_at: new Date().toISOString(), last_error: String(reason || "printer_unreachable").slice(0, 120) })
    .eq("id", jobId)
    .eq("restaurant_id", restaurantId)
    .eq("leased_by", terminalId)
    .is("printed_at", null);
  if (error) throw error;
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

export const STUCK_AFTER_MS = 60 * 1000;
const STUCK_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function stuckPrintJobs(admin, restaurantId) {
  const since = new Date(Date.now() - STUCK_WINDOW_MS).toISOString();
  const before = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from("print_jobs")
    .select("id, kind, payload, created_at, attempts, last_error, printer_id")
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null)
    .is("dismissed_at", null)
    .eq("needs_ack", false)
    .in("kind", [...TICKET_KINDS, ...RECEIPT_KINDS.filter((k) => k !== "report")])
    .gte("created_at", since)
    .lt("created_at", before)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data || []).map((j) => ({
    id: j.id,
    kind: j.kind,
    created_at: j.created_at,
    table_no: j.payload?.table_no ?? null,
    table_label: j.payload?.table_label || null,
    station: j.payload?.station || null,
    takeaway: j.payload?.takeaway?.code || j.payload?.takeaway?.name || null,
    printer: j.payload?.printer?.name || null,
    attempts: Number(j.attempts || 0),
    error: j.last_error || (j.printer_id ? null : "no_printer"),
  }));
}

export async function dismissPrintJob(admin, restaurantId, jobId, by) {
  const { error } = await admin
    .from("print_jobs")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: String(by || "staff").slice(0, 60) })
    .eq("id", String(jobId || ""))
    .eq("restaurant_id", restaurantId)
    .is("printed_at", null);
  if (error) throw error;
  return { ok: true };
}
