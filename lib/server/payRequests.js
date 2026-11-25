import { isBillClosed } from "@/lib/server/tableBill";
import { heldPromo } from "@/lib/server/promoCode";
import { guestsOf, openLinesFor, pickItems, splitKind, splitState } from "@/lib/server/splitBill";

const METHODS = ["CARD", "MAUCAS"];
const MAX_TIP_CENTS = 100_000;
const FIELDS = "id, order_id, method, amount, tip, items, status, part_no, reason, claimed_by, claimed_at, created_at, updated_at, target_terminal_id";
const ONLINE_MS = 3 * 60 * 1000;

export async function onlinePosTerminals(admin, restaurantId) {
  const since = new Date(Date.now() - ONLINE_MS).toISOString();
  const { data, error } = await admin
    .from("pos_terminals")
    .select("id, label, last_seen_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .not("auth_user_id", "is", null)
    .gte("last_seen_at", since)
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map((t) => ({ id: t.id, label: t.label || "POS" }));
}

async function pickTerminal(admin, restaurantId, terminalId) {
  if (!terminalId) return { id: null };
  const list = await onlinePosTerminals(admin, restaurantId);
  return list.some((t) => t.id === String(terminalId)) ? { id: String(terminalId) } : { error: "That POS is offline. Pick another POS." };
}
const CLAIM_MS = 3 * 60 * 1000;

const fail = (status, error) => ({ status, body: { ok: false, error } });
const BUSY = "The guest is paying on the POS right now. Wait for the result on the POS.";

export function inProgress(r, now = Date.now()) {
  return Boolean(r?.claimed_by) && now - new Date(r.claimed_at || 0).getTime() < CLAIM_MS;
}
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
  let pending = await orderPending(admin, restaurantId, orderId);
  const full = body?.full === true;
  if (full && !method) return fail(400, "Pick Card or MauCas.");
  if (full) {
    const waiting = pending.filter((r) => r.method);
    if (waiting.some((r) => inProgress(r))) return fail(409, BUSY);
    if (waiting.length) {
      const replaced = await replaceWaiting(admin, restaurantId, userId, waiting);
      if (replaced.length !== waiting.length) return fail(409, BUSY);
      pending = pending.filter((r) => !replaced.includes(r.id));
    }
  }
  const free = reserve(state, pending);
  if (free.remainingCents <= 0) return fail(400, "Everything left on this bill is already sent to the POS.");
  const guestId = body?.guest_id ? String(body.guest_id) : "";
  let asked = body?.items;
  let guest = null;
  if (guestId) {
    guest = guestsOf(row).find((g) => g.id === guestId);
    if (!guest) return fail(404, "This guest is no longer on the bill.");
    asked = openLinesFor(free, guest.id);
    if (!asked.length) return fail(400, `Nothing is left to send for ${guest.name}.`);
  }
  const kind = splitKind(state.payments) || (pending.length ? (pending.some((r) => r.items?.length) ? "items" : "amount") : null);
  if (full && kind === "items") asked = openLinesFor(free, null, true);
  const byItems = Array.isArray(asked) && asked.length > 0;
  if (kind === "amount" && byItems) return fail(409, "This bill is being split by amount. Continue by amount.");
  if (kind === "items" && !byItems) return fail(409, "This bill is being split by items. Continue by items.");

  let items = null;
  let amountCents;
  if (byItems) {
    const picked = pickItems(asked, free.lines);
    if (picked.error) return fail(400, picked.error);
    if (picked.amountCents > free.remainingCents) return fail(400, "These items cost more than what is left to pay.");
    items = picked.items.map((it) => ({ line_key: it.line_key, qty: it.qty, name: it.name }));
    amountCents = picked.amountCents;
  } else {
    amountCents = full ? free.remainingCents : cents(body?.amount);
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > free.remainingCents) {
      return fail(400, "Enter an amount up to what is left to pay.");
    }
  }
  const tipCents = cents(body?.tip_amount);
  if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > Math.max(amountCents, MAX_TIP_CENTS)) {
    return fail(400, "Invalid tip amount.");
  }
  const target = await pickTerminal(admin, restaurantId, body?.terminal_id);
  if (target.error) return fail(409, target.error);

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
      ...(target.id ? { target_terminal_id: target.id } : {}),
    })
    .select(FIELDS)
    .single();
  if (insErr) return fail(400, insErr.message);
  if (guestId) return { status: 200, body: { ok: true, request: { ...data, guest: guest.name } } };
  await admin
    .from("restaurant_table_bookings")
    .update({ booking_status: "COMPLETED", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("booking_status", ["PLACED", "CONFIRMED", "PREPARING", "SERVED"]);
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
      guest_id: bill?.guest_id,
      terminal_id: body?.terminal_id,
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

async function replaceWaiting(admin, restaurantId, userId, waiting) {
  const stale = new Date(Date.now() - CLAIM_MS).toISOString();
  const { data, error } = await admin
    .from("pos_payment_requests")
    .update({ status: "cancelled", handled_by: userId, reason: "Replaced on the Partner app", updated_at: new Date().toISOString() })
    .in("id", waiting.map((r) => r.id))
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .or(`claimed_by.is.null,claimed_at.lt.${stale}`)
    .select("id");
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

export async function cancelPayRequest(admin, restaurantId, userId, body, status = "cancelled", terminalId = null) {
  const id = String(body?.request_id || "").trim();
  if (!id) return fail(400, "request_id is required");
  let query = admin
    .from("pos_payment_requests")
    .update({ status, handled_by: userId, reason: String(body?.reason || "").slice(0, 120) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending");
  if (terminalId) {
    query = query.or(`claimed_by.is.null,claimed_by.eq.${terminalId}`);
  } else {
    query = query.or(`claimed_by.is.null,claimed_at.lt.${new Date(Date.now() - CLAIM_MS).toISOString()}`);
  }
  const { data, error } = await query.select(FIELDS);
  if (error) return fail(400, error.message);
  if (!data?.length) {
    const { data: now } = await admin.from("pos_payment_requests").select(FIELDS).eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
    if (now?.status === "pending" && inProgress(now)) return fail(409, BUSY);
    return fail(409, "This payment request was already handled.");
  }
  return { status: 200, body: { ok: true, request: data[0] } };
}

export async function failPayRequest(admin, restaurantId, terminalId, body) {
  const id = String(body?.request_id || "").trim();
  if (!id || !terminalId) return fail(400, "request_id is required");
  const code = String(body?.code ?? "").slice(0, 20);
  const message = String(body?.message || "Payment not completed").replace(/\s+/g, " ").trim().slice(0, 100);
  const { data, error } = await admin
    .from("pos_payment_requests")
    .update({
      status: "failed",
      reason: code ? `${message} (${code})` : message,
      claimed_by: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .or(`claimed_by.is.null,claimed_by.eq.${terminalId}`)
    .select(FIELDS);
  if (error) throw error;
  return { status: 200, body: { ok: true, failed: Boolean(data?.length) } };
}

export async function retryPayRequest(admin, restaurantId, terminalId, body) {
  const id = String(body?.request_id || "").trim();
  if (!id || !terminalId) return fail(400, "request_id is required");
  const { data: req, error } = await admin.from("pos_payment_requests").select(FIELDS).eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw error;
  if (!req || req.status !== "failed") return fail(409, "This payment was changed on the Partner app.");
  const { data: row, error: rowErr } = await admin
    .from("restaurant_table_bookings")
    .select("id, order_items, order_details, total_amount, payment_status, booking_status")
    .eq("id", req.order_id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row || isBillClosed(row)) return fail(409, "This bill is already closed.");
  const pending = await orderPending(admin, restaurantId, req.order_id);
  if (pending.some((r) => r.method)) return fail(409, "The Partner app already sent a new payment for this bill.");
  const free = reserve(splitState(row), pending);
  if (cents(req.amount) > free.remainingCents) return fail(409, "This bill changed. Ask the Partner app to send it again.");
  const { data, error: upErr } = await admin
    .from("pos_payment_requests")
    .update({ status: "pending", reason: null, claimed_by: terminalId, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "failed")
    .select(FIELDS);
  if (upErr) throw upErr;
  if (!data?.length) return fail(409, "This payment was changed on the Partner app.");
  return { status: 200, body: { ok: true, request: data[0] } };
}

export async function claimPayRequest(admin, restaurantId, terminalId, requestId) {
  const id = String(requestId || "").trim();
  if (!id || !terminalId) return fail(400, "request_id is required");
  const { data: current, error } = await admin
    .from("pos_payment_requests")
    .select("id, status, method, claimed_by, claimed_at, target_terminal_id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!current || current.status !== "pending") return { status: 200, body: { ok: true, claimed: false, reason: "not_pending" } };
  if (current.target_terminal_id && current.target_terminal_id !== terminalId) return { status: 200, body: { ok: true, claimed: false, reason: "other_pos" } };
  if (current.claimed_by === terminalId) return { status: 200, body: { ok: true, claimed: true, fresh: false } };
  const stale = new Date(Date.now() - CLAIM_MS).toISOString();
  const fresh = !current.claimed_by;
  let query = admin
    .from("pos_payment_requests")
    .update({ claimed_by: terminalId, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending");
  query = fresh ? query.is("claimed_by", null) : query.eq("claimed_by", current.claimed_by).lt("claimed_at", stale);
  const { data: won, error: upErr } = await query.select("id");
  if (upErr) throw upErr;
  return { status: 200, body: { ok: true, claimed: Boolean(won?.length), fresh: fresh && Boolean(won?.length) } };
}

export async function pendingPayRequests(admin, restaurantId, terminalId = null) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from("pos_payment_requests")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .gte("created_at", since);
  if (terminalId) query = query.or(`target_terminal_id.is.null,target_terminal_id.eq.${terminalId}`);
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  return data || [];
}
