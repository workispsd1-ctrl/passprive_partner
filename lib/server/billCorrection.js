import { isDeposit } from "@/lib/server/splitBill";
import { queueFinalPrint, queueTakeawayReceipt, staffName } from "@/lib/server/printJobs";

export async function printCorrected(admin, restaurantId, kind, orderId) {
  if (kind !== "pickup") return queueFinalPrint(admin, restaurantId, orderId, { corrected: true });
  const { data: order } = await admin
    .from("restaurant_orders")
    .select("id, customer_name, pickup_code, order_number, items, total_amount, payment_method")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (order) await queueTakeawayReceipt(admin, restaurantId, order, { method: order.payment_method, corrected: true });
}

export const MANUAL_METHODS = ["CASH", "CARD", "MAUCAS", "JUICE", "CHEQUE", "AVOIR"];
const NEEDS_REFERENCE = ["CHEQUE", "AVOIR"];
const WINDOW_MS = 24 * 60 * 60 * 1000;
const FIXED = ["PROMO", "DEPOSIT", "ACCOUNT"];

const fail = (status, error) => ({ status, body: { ok: false, error } });
const cents = (n) => Math.round(Number(n || 0) * 100);
const up = (v) => String(v || "").trim().toUpperCase();
const details = (row) => (row?.order_details && typeof row.order_details === "object" ? row.order_details : {});
const viaTerminal = (p) => Boolean(p?.gateway && (p.gateway.rrn || p.gateway.auth_code || p.gateway.terminal_id));

function tooOld(at, now) {
  const t = Date.parse(at || "");
  return !Number.isFinite(t) || now - t > WINDOW_MS;
}

export function methodChange(row, { part = null, to, reference = "", reason, by, at }) {
  const d = details(row);
  const payment = d.payment && typeof d.payment === "object" ? { ...d.payment } : null;
  if (!payment) return { error: "This bill has no payment to change." };
  const target = up(to);
  if (!MANUAL_METHODS.includes(target)) return { error: "Pick a payment method." };
  if (NEEDS_REFERENCE.includes(target) && !String(reference || "").trim()) return { error: "Enter the reference number." };
  if (String(reason || "").trim().length < 2) return { error: "A reason is required." };

  const split = Array.isArray(payment.split) ? payment.split.map((s) => ({ ...s })) : null;
  const parts = Array.isArray(d.payments) ? d.payments.map((p) => ({ ...p })) : [];
  let from;
  if (split) {
    const i = Number(part);
    if (!Number.isInteger(i) || i < 0 || i >= split.length) return { error: "Pick which payment to change." };
    from = up(split[i].method);
    if (FIXED.includes(from)) return { error: "This part of the bill can't be changed." };
    const linked = parts.length === split.length ? parts[i] : null;
    if (viaTerminal(linked) || (!linked && viaTerminal(payment) && ["CARD", "MAUCAS"].includes(from))) {
      return { error: "This payment went through the payment terminal. Refund it on the terminal instead." };
    }
    if (from === target) return { error: "This payment already has that method." };
    if (target === "CASH" && (cents(linked?.tip) || (!parts.length && cents(payment.tip) && up(payment.tip_method) === from))) return { error: "This payment includes a tip, and tips can't be on cash. Pick another method." };
    split[i].method = target;
    if (linked) {
      linked.method = target;
      linked.received = (cents(linked.amount) + cents(linked.tip)) / 100;
      linked.change = 0;
      if (reference) linked.reference = String(reference).trim().slice(0, 60);
      parts[i] = linked;
    }
    payment.split = split;
    if (!parts.length && up(payment.tip_method) === from && up(payment.method) === from) payment.tip_method = target;
    const real = [...new Set(split.map((s) => up(s.method)).filter((m) => !FIXED.includes(m)))];
    payment.method = real.length === 1 ? real[0] : "SPLIT";
    if (parts.length) {
      const tips = {};
      for (const p of parts) if (cents(p.tip)) tips[p.method] = (tips[p.method] || 0) + cents(p.tip);
      if (Object.keys(tips).length) payment.tip_split = Object.entries(tips).map(([method, c]) => ({ method, amount: c / 100 }));
    }
  } else {
    from = up(payment.method || row.payment_method);
    if (FIXED.includes(from)) return { error: "This payment can't be changed." };
    if (viaTerminal(payment)) return { error: "This payment went through the payment terminal. Refund it on the terminal instead." };
    if (from === target) return { error: "This payment already has that method." };
    if (target === "CASH" && cents(payment.tip)) return { error: "This payment includes a tip, and tips can't be on cash. Pick another method." };
    payment.method = target;
    if (payment.tip_method) payment.tip_method = target;
    const charged = cents(payment.amount_charged ?? payment.amount_due);
    payment.amount_received = charged / 100;
    payment.change = 0;
    if (reference) payment.reference = String(reference).trim().slice(0, 60);
  }

  const correction = { type: "method", part: split ? Number(part) : null, from, to: target, reason: String(reason).trim().slice(0, 120), by, at };
  return {
    from,
    patch: {
      payment_method: payment.method,
      ...(reference && !split ? { payment_reference: String(reference).trim().slice(0, 60) } : {}),
      order_details: {
        ...d,
        payment,
        ...(parts.length ? { payments: parts } : {}),
        corrections: [...(Array.isArray(d.corrections) ? d.corrections : []), correction].slice(-50),
      },
    },
  };
}

export function reopenPatch(row, { reason, refunded = false, by, at }) {
  const d = details(row);
  if (String(reason || "").trim().length < 2) return { error: "A reason is required." };
  const parts = Array.isArray(d.payments) ? d.payments : [];
  const paid = [d.payment, ...parts].filter(Boolean);
  if (paid.some(viaTerminal) && !refunded) return { error: "terminal_refund_needed" };
  if (row.promo_code) return { error: "Bills paid with a promo code can't be reopened." };
  const keep = parts.filter(isDeposit);
  const removed = parts.filter((p) => !isDeposit(p));
  const record = {
    reason: String(reason).trim().slice(0, 120),
    terminal_refunded: Boolean(refunded),
    payment: d.payment || null,
    payments: removed,
    tip: Number(row.tip_amount || 0),
    method: row.payment_method || null,
    by,
    at,
  };
  const next = { ...d, reopened: [...(Array.isArray(d.reopened) ? d.reopened : []), record].slice(-20) };
  delete next.payment;
  if (keep.length) next.payments = keep.map((p, i) => ({ ...p, no: i + 1 }));
  else delete next.payments;
  return {
    patch: {
      payment_status: "PENDING",
      booking_status: "COMPLETED",
      payment_method: "CASH",
      payment_reference: null,
      tip_amount: 0,
      order_details: next,
    },
  };
}

export function cancelPaidPatch(row, { reason, refunded = false, by, at }) {
  const d = details(row);
  if (String(reason || "").trim().length < 2) return { error: "A reason is required." };
  const parts = Array.isArray(d.payments) ? d.payments : [];
  const paid = [d.payment, ...parts].filter(Boolean);
  if (paid.some(viaTerminal) && !refunded) return { error: "terminal_refund_needed" };
  if (row.promo_code) return { error: "Bills paid with a promo code can't be cancelled." };
  if (parts.some(isDeposit)) return { error: "This bill includes a booking deposit, so it can't be cancelled. Reopen it instead." };
  const record = {
    reason: String(reason).trim().slice(0, 120),
    by,
    at,
    total_amount: Number(row.total_amount || 0),
    paid_bill: {
      method: row.payment_method || null,
      tip: Number(row.tip_amount || 0),
      terminal_refunded: Boolean(refunded),
      account_id: row.account_id || null,
    },
  };
  return {
    record,
    patch: {
      booking_status: "CANCELLED",
      ...(row.account_id ? { account_id: null } : {}),
      order_details: { ...d, void: record },
    },
  };
}

async function loadPaidTable(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, total_amount, tip_amount, payment_method, payment_status, booking_status, promo_code, order_details, updated_at, account_id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const isPaid = (row) => ["PAID", "COMPLETED"].includes(up(row?.payment_status)) && up(row?.booking_status) !== "CANCELLED";

async function save(admin, restaurantId, row, patch) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (error) return fail(400, error.message);
  if (!data?.length) return fail(409, "This bill was just updated. Please try again.");
  return null;
}

export async function correctMethod(admin, restaurantId, userId, body, now = Date.now()) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");
  const at = new Date(now).toISOString();
  if (body?.kind === "pickup") {
    const { data: order, error } = await admin
      .from("restaurant_orders")
      .select("id, payment_method, payment_status, order_status, metadata, picked_up_at, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw error;
    if (!order) return fail(404, "Order not found.");
    if (up(order.payment_status) !== "PAID") return fail(409, "This order is not paid.");
    if (tooOld(order.picked_up_at || order.updated_at, now)) return fail(409, "Payments can only be corrected within 24 hours.");
    const from = up(order.payment_method);
    if (from === "ACCOUNT") return fail(409, "This order is on a customer account. It can't be changed here.");
    const target = up(body?.to);
    if (!MANUAL_METHODS.includes(target)) return fail(400, "Pick a payment method.");
    if (from === target) return fail(400, "This payment already has that method.");
    if (String(body?.reason || "").trim().length < 2) return fail(400, "A reason is required.");
    if (viaTerminal(order.metadata?.payment)) return fail(409, "This payment went through the payment terminal. Refund it on the terminal instead.");
    const meta = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
    const correction = { type: "method", from, to: target, reason: String(body.reason).trim().slice(0, 120), by: userId, at };
    const { data: saved, error: upErr } = await admin
      .from("restaurant_orders")
      .update({ payment_method: target, metadata: { ...meta, corrections: [...(meta.corrections || []), correction].slice(-50) }, updated_at: at })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .eq("updated_at", order.updated_at)
      .select("id");
    if (upErr) return fail(400, upErr.message);
    if (!saved?.length) return fail(409, "This order was just updated. Please try again.");
    return { status: 200, body: { ok: true, from, to: target } };
  }

  const row = await loadPaidTable(admin, restaurantId, orderId);
  if (!row) return fail(404, "Bill not found.");
  if (!isPaid(row)) return fail(409, "This bill is not paid.");
  if (tooOld(details(row).payment?.at || row.updated_at, now)) return fail(409, "Payments can only be corrected within 24 hours.");
  const change = methodChange(row, { part: body?.part ?? null, to: body?.to, reference: body?.reference, reason: body?.reason, by: userId, at });
  if (change.error) return fail(409, change.error);
  const failed = await save(admin, restaurantId, row, change.patch);
  if (failed) return failed;
  return { status: 200, body: { ok: true, from: change.from, to: up(body?.to) } };
}

export async function cancelPaidBill(admin, restaurantId, userId, body, now = Date.now()) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");
  const row = await loadPaidTable(admin, restaurantId, orderId);
  if (!row) return fail(404, "Bill not found.");
  if (!isPaid(row)) return fail(409, "This bill is not paid.");
  if (tooOld(details(row).payment?.at || row.updated_at, now)) return fail(409, "Bills can only be cancelled within 24 hours.");
  if (row.account_id) {
    const { data: settled, error: sErr } = await admin
      .from("customer_account_payments")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("account_id", row.account_id)
      .contains("allocations", [{ order_id: row.id }])
      .limit(1);
    if (sErr) throw sErr;
    if (settled?.length) return fail(409, "The customer already paid part of this bill on their account, so it can't be cancelled.");
  }
  const out = cancelPaidPatch(row, { reason: body?.reason, refunded: body?.refunded === true, by: userId, at: new Date(now).toISOString() });
  if (out.error === "terminal_refund_needed") {
    return { status: 409, body: { ok: false, error: "terminal_refund_needed", message: "This bill was paid on the payment terminal. Refund it on the terminal first, then confirm." } };
  }
  if (out.error) return fail(409, out.error);
  const failed = await save(admin, restaurantId, row, out.patch);
  if (failed) return failed;
  if (body?.print !== false) {
    const by = await staffName(admin, restaurantId, userId).then((s) => s?.name || null, () => null);
    await queueFinalPrint(admin, restaurantId, row.id, { cancelled: { reason: out.record.reason, at: out.record.at, by } }).catch((e) => console.error("cancelled invoice print failed", e?.message));
  }
  return { status: 200, body: { ok: true } };
}

export async function reopenPaidBill(admin, restaurantId, userId, body, now = Date.now()) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");
  const row = await loadPaidTable(admin, restaurantId, orderId);
  if (!row) return fail(404, "Bill not found.");
  if (!isPaid(row)) return fail(409, "This bill is not paid.");
  if (tooOld(details(row).payment?.at || row.updated_at, now)) return fail(409, "Bills can only be reopened within 24 hours.");
  if (row.account_id) {
    const { data: settled, error: sErr } = await admin
      .from("customer_account_payments")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("account_id", row.account_id)
      .contains("allocations", [{ order_id: row.id }])
      .limit(1);
    if (sErr) throw sErr;
    if (settled?.length) return fail(409, "The customer already paid part of this bill on their account, so it can't be reopened.");
  }
  const out = reopenPatch(row, { reason: body?.reason, refunded: body?.refunded === true, by: userId, at: new Date(now).toISOString() });
  if (out.patch && row.account_id) out.patch.account_id = null;
  if (out.error === "terminal_refund_needed") {
    return { status: 409, body: { ok: false, error: "terminal_refund_needed", message: "This bill was paid on the payment terminal. Refund it on the terminal first, then confirm." } };
  }
  if (out.error) return fail(409, out.error);
  const failed = await save(admin, restaurantId, row, out.patch);
  if (failed) return failed;
  return { status: 200, body: { ok: true, table_no: null } };
}
