import { isBillClosed } from "@/lib/server/tableBill";
import { heldPromo } from "@/lib/server/promoCode";
import { pickItems, splitKind, splitState } from "@/lib/server/splitBill";

const METHODS = ["CARD", "MAUCAS"];
const MAX_TIP_CENTS = 100_000;
const FIELDS = "id, order_id, method, amount, tip, items, status, part_no, reason, created_at, updated_at";

const fail = (status, error) => ({ status, body: { ok: false, error } });
const cents = (n) => Math.round(Number(n || 0) * 100);

export async function createPayRequest(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const method = String(body?.method || "").trim().toUpperCase();
  if (!orderId) return fail(400, "order_id is required");
  if (method && !METHODS.includes(method)) return fail(400, "Card and MauCas are taken on the POS.");

  const { data: row, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, order_items, order_details, total_amount, payment_status, booking_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) return fail(400, error.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");
  if (await heldPromo(admin, restaurantId, orderId)) return fail(409, "Bills with a promo code are paid in full on the POS.");

  const state = splitState(row);
  const pending = await orderPending(admin, restaurantId, orderId);
  const free = reserve(state, pending);
  if (free.remainingCents <= 0) return fail(400, "Everything left on this bill is already sent to the POS.");
  const byItems = Array.isArray(body?.items) && body.items.length > 0;
  const kind = splitKind(state.payments) || (pending.length ? (pending.some((r) => r.items?.length) ? "items" : "amount") : null);
  if (kind === "amount" && byItems) return fail(409, "This bill is being split by amount. Continue by amount.");
  if (kind === "items" && !byItems) return fail(409, "This bill is being split by items. Continue by items.");

  let items = null;
  let amountCents;
  if (byItems) {
    const picked = pickItems(body.items, free.lines);
    if (picked.error) return fail(400, picked.error);
    if (picked.amountCents > free.remainingCents) return fail(400, "These items cost more than what is left to pay.");
    items = picked.items.map((it) => ({ line_key: it.line_key, qty: it.qty, name: it.name }));
    amountCents = picked.amountCents;
  } else {
    amountCents = cents(body?.amount);
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > free.remainingCents) {
      return fail(400, "Enter an amount up to what is left to pay.");
    }
  }
  const tipCents = cents(body?.tip_amount);
  if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > Math.max(amountCents, MAX_TIP_CENTS)) {
    return fail(400, "Invalid tip amount.");
  }

  const { data, error: insErr } = await admin
    .from("pos_payment_requests")
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      method: method || null,
      amount: amountCents / 100,
      tip: tipCents / 100,
      items,
      requested_by: userId,
    })
    .select(FIELDS)
    .single();
  if (insErr) return fail(400, insErr.message);
  return { status: 200, body: { ok: true, request: data } };
}

export async function createPayBills(admin, restaurantId, userId, body) {
  const bills = Array.isArray(body?.bills) ? body.bills.slice(0, 30) : [];
  if (!bills.length) return fail(400, "Nothing to split.");
  const requests = [];
  for (const bill of bills) {
    const out = await createPayRequest(admin, restaurantId, userId, {
      order_id: body.order_id,
      items: bill?.items,
      amount: bill?.amount,
    });
    if (!out.body.ok) return requests.length ? { status: 200, body: { ok: true, requests, error: out.body.error } } : out;
    requests.push(out.body.request);
  }
  return { status: 200, body: { ok: true, requests } };
}

export function reserve(state, pending) {
  const held = new Map();
  let heldCents = 0;
  for (const r of pending) {
    heldCents += cents(r.amount);
    for (const it of Array.isArray(r.items) ? r.items : []) held.set(it.line_key, (held.get(it.line_key) || 0) + Number(it.qty || 0));
  }
  return {
    remainingCents: Math.max(0, state.remainingCents - heldCents),
    lines: state.lines.map((l) => ({ ...l, open_qty: Math.max(0, l.open_qty - (held.get(l.line_key) || 0)) })),
  };
}

async function orderPending(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("pos_payment_requests")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "pending");
  if (error) throw error;
  return data || [];
}

export async function cashGuard(admin, restaurantId, body) {
  const orderId = String(body?.order_id || "").trim();
  const pending = await orderPending(admin, restaurantId, orderId);
  if (!pending.length) return null;
  const { data: row, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, order_items, order_details, total_amount")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !row?.id) return null;
  const free = reserve(splitState(row), pending);
  const busy = "Part of this bill is waiting on the POS. Take only what is not sent, or cancel the POS request.";
  if (Array.isArray(body?.items) && body.items.length) {
    const picked = pickItems(body.items, free.lines);
    return picked.error ? busy : null;
  }
  return cents(body?.amount) > free.remainingCents ? busy : null;
}

export async function orderPayRequests(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("pos_payment_requests")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function cancelPayRequest(admin, restaurantId, userId, body, status = "cancelled") {
  const id = String(body?.request_id || "").trim();
  if (!id) return fail(400, "request_id is required");
  const { data, error } = await admin
    .from("pos_payment_requests")
    .update({ status, handled_by: userId, reason: String(body?.reason || "").slice(0, 120) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .select(FIELDS);
  if (error) return fail(400, error.message);
  if (!data?.length) return fail(409, "This payment request was already handled.");
  return { status: 200, body: { ok: true, request: data[0] } };
}

export async function pendingPayRequests(admin, restaurantId) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("pos_payment_requests")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  return data || [];
}
