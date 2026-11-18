import { isBillClosed } from "@/lib/server/tableBill";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";
import { lineKey } from "@/lib/server/menuPricing";
import { heldPromo } from "@/lib/server/promoCode";

const METHODS = ["CASH", "CARD", "MAUCAS", "JUICE", "CHEQUE", "AVOIR"];
const NEEDS_REFERENCE = ["CHEQUE", "AVOIR"];
const ATTEMPTS = 3;
const MAX_TIP_CENTS = 100_000;
const MAX_PARTS = 30;

const fail = (status, error) => ({ status, body: { ok: false, error } });
const cents = (n) => Math.round(Number(n || 0) * 100);
const text = (v, max) => String(v || "").trim().slice(0, max) || null;
const details = (row) => (row?.order_details && typeof row.order_details === "object" ? row.order_details : {});

export function partPayments(row) {
  const list = details(row).payments;
  return Array.isArray(list) ? list : [];
}

export function hasPartPayments(row) {
  return partPayments(row).length > 0;
}

export function splitKind(payments) {
  if (!payments.length) return null;
  return payments.some((p) => Array.isArray(p.items) && p.items.length) ? "items" : "amount";
}

export function splitState(row) {
  const payments = partPayments(row);
  const paidQty = new Map();
  for (const p of payments) {
    for (const it of Array.isArray(p.items) ? p.items : []) {
      paidQty.set(it.line_key, (paidQty.get(it.line_key) || 0) + Number(it.qty || 0));
    }
  }
  const lines = normalizeItems(extractOrderItems(row)).map((it) => {
    const key = it.line_key || lineKey(it);
    return { ...it, line_key: key, open_qty: Math.max(0, it.qty - (paidQty.get(key) || 0)) };
  });
  const billCents = cents(row.total_amount);
  const paidCents = payments.reduce((sum, p) => sum + cents(p.amount), 0);
  return { billCents, paidCents, remainingCents: Math.max(0, billCents - paidCents), lines, payments };
}

function gatewayRecord(gateway, terminalId) {
  if (!gateway || typeof gateway !== "object") return null;
  return {
    merchant_ref: text(gateway.merchant_ref, 64),
    auth_code: text(gateway.auth_code, 20),
    rrn: text(gateway.rrn, 32),
    trace_no: text(gateway.trace_no, 20),
    batch_no: text(gateway.batch_no, 20),
    card_type: text(gateway.card_type, 30),
    last4: text(gateway.last4, 4),
    terminal_id: terminalId || null,
  };
}

function pickItems(rawItems, lines) {
  const chosen = new Map();
  for (const raw of rawItems) {
    const key = String(raw?.line_key || "");
    const qty = Number(raw?.qty);
    if (!key || !Number.isInteger(qty) || qty < 1) return { error: "Pick the items to pay for." };
    chosen.set(key, (chosen.get(key) || 0) + qty);
  }
  const items = [];
  let amountCents = 0;
  for (const [key, qty] of chosen) {
    const line = lines.find((l) => l.line_key === key);
    if (!line) return { error: "An item on this bill changed. Refresh and try again." };
    if (qty > line.open_qty) return { error: `${line.name} is already paid.` };
    const lineCents = cents(line.unit_price) * qty;
    amountCents += lineCents;
    items.push({ line_key: key, name: line.name, qty, unit_price: line.unit_price, amount: lineCents / 100 });
  }
  return { items, amountCents };
}

export async function payBillPart(admin, restaurantId, userId, body, terminalId = null) {
  const orderId = String(body?.order_id || "").trim();
  const method = String(body?.method || "").trim().toUpperCase();
  const idempotencyKey = String(body?.idempotency_key || "").trim().slice(0, 64);
  const reference = text(body?.reference, 60);
  if (!orderId || !idempotencyKey) return fail(400, "order_id and idempotency_key are required");
  if (!METHODS.includes(method)) return fail(400, "Pick a payment method.");
  if (NEEDS_REFERENCE.includes(method) && !reference) return fail(400, "Enter the reference number.");

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const { data: row, error: rowErr } = await admin
      .from("restaurant_table_bookings")
      .select("id, order_items, order_details, total_amount, tip_amount, payment_status, booking_status, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (rowErr) return fail(400, rowErr.message);
    if (!row?.id) return fail(404, "Order not found.");

    const state = splitState(row);
    const existing = state.payments.find((p) => p.id === idempotencyKey);
    if (existing) {
      return { status: 200, body: { ok: true, part: existing, remaining: state.remainingCents / 100, closed: isBillClosed(row), payments: state.payments } };
    }
    if (isBillClosed(row)) return fail(409, "This bill is already closed.");
    if (state.remainingCents <= 0 || !state.lines.length) return fail(400, "There is nothing left to pay on this bill.");
    if (state.payments.length >= MAX_PARTS) return fail(400, "Too many split payments on this bill.");
    if (await heldPromo(admin, restaurantId, orderId)) return fail(409, "Remove the promo code before splitting the bill.");

    const byItems = Array.isArray(body?.items) && body.items.length > 0;
    const kind = splitKind(state.payments);
    if (kind === "amount" && byItems) return fail(409, "This bill is being split by amount. Continue by amount.");
    if (kind === "items" && !byItems) return fail(409, "This bill is being split by items. Continue by items.");

    let items = null;
    let amountCents;
    if (byItems) {
      const picked = pickItems(body.items, state.lines);
      if (picked.error) return fail(400, picked.error);
      if (picked.amountCents > state.remainingCents) return fail(400, "These items cost more than what is left to pay.");
      items = picked.items;
      amountCents = picked.amountCents;
    } else {
      amountCents = cents(body?.amount);
      if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > state.remainingCents) {
        return fail(400, "Enter an amount up to what is left to pay.");
      }
    }

    const tipCents = cents(body?.tip_amount);
    if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > Math.max(amountCents, MAX_TIP_CENTS)) {
      return fail(400, "Invalid tip amount.");
    }
    const chargeCents = amountCents + tipCents;
    if (body?.paid_cents !== undefined && Number(body.paid_cents) !== chargeCents) return fail(409, "amount_mismatch");
    const receivedCents = method === "CASH" ? cents(body?.amount_received ?? chargeCents / 100) : chargeCents;
    if (!Number.isFinite(receivedCents) || receivedCents < chargeCents || receivedCents > chargeCents + 10_000_000) {
      return fail(400, "Amount received is less than this payment.");
    }

    const at = new Date().toISOString();
    const gateway = gatewayRecord(body?.gateway, terminalId);
    const part = {
      id: idempotencyKey,
      no: state.payments.length + 1,
      method,
      amount: amountCents / 100,
      tip: tipCents / 100,
      received: receivedCents / 100,
      change: (receivedCents - chargeCents) / 100,
      ...(items ? { items } : {}),
      reference: reference || gateway?.rrn || gateway?.auth_code || null,
      ...(gateway ? { gateway } : {}),
      by: userId,
      at,
    };
    const payments = [...state.payments, part];
    const remainingCents = state.remainingCents - amountCents;
    const closed = remainingCents === 0;
    const prevDetails = details(row);
    const totalTipCents = cents(row.tip_amount) + tipCents;
    const patch = {
      order_details: { ...prevDetails, payments },
      tip_amount: totalTipCents / 100,
      updated_at: at,
    };
    if (closed) {
      const methods = [...new Set(payments.map((p) => p.method))];
      const tipSplit = Object.entries(
        payments.reduce((acc, p) => (cents(p.tip) ? { ...acc, [p.method]: (acc[p.method] || 0) + cents(p.tip) } : acc), {})
      ).map(([m, c]) => ({ method: m, amount: c / 100 }));
      patch.payment_status = "PAID";
      patch.booking_status = "COMPLETED";
      patch.payment_method = methods.length === 1 ? methods[0] : "SPLIT";
      patch.payment_reference = payments.map((p) => p.reference).filter(Boolean).join(", ").slice(0, 200) || null;
      patch.order_details.payment = {
        method: patch.payment_method,
        amount_due: state.billCents / 100,
        amount_received: payments.reduce((s, p) => s + cents(p.received), 0) / 100,
        change: payments.reduce((s, p) => s + cents(p.change), 0) / 100,
        split: payments.map((p) => ({ method: p.method, amount: p.amount })),
        parts: payments.length,
        ...(totalTipCents ? { tip: totalTipCents / 100, tip_split: tipSplit } : {}),
        by: userId,
        at,
        idempotency_key: idempotencyKey,
      };
    }

    const { data: updated, error: upErr } = await admin
      .from("restaurant_table_bookings")
      .update(patch)
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .eq("updated_at", row.updated_at)
      .not("payment_status", "in", "(PAID,COMPLETED)")
      .select("id");
    if (upErr) return fail(400, upErr.message);
    if (updated?.length) {
      return { status: 200, body: { ok: true, part, remaining: remainingCents / 100, closed, payments } };
    }
  }
  return fail(409, "This bill changed while paying. Check it and try again.");
}
