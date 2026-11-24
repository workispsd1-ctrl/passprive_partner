import { isBillClosed } from "@/lib/server/tableBill";
import { lineKey } from "@/lib/server/menuPricing";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";
import { heldPromo } from "@/lib/server/promoCode";
import { isDeposit } from "@/lib/server/splitBill";

const fail = (status, error) => ({ status, body: { ok: false, error } });
const toCents = (n) => Math.round(Number(n || 0) * 100);

export function billPct(details) {
  const pct = Number(details?.bill_discount?.pct || 0);
  return Number.isInteger(pct) && pct > 0 && pct <= 100 ? pct : 0;
}

export function priceLine(line, bill = 0) {
  const list = line.list_price != null ? Number(line.list_price) : Number(line.unit_price || 0);
  const dish = Number(line.discount_pct || 0);
  const out = { ...line };
  delete out.list_price;
  delete out.discount_pct;
  if (dish > 0) out.discount_pct = dish;
  const unitCents = Math.round(toCents(list) * (1 - dish / 100) * (1 - bill / 100));
  if (dish > 0 || bill > 0) out.list_price = list;
  out.unit_price = unitCents / 100;
  out.line_total = (unitCents * Number(line.qty || 0)) / 100;
  out.line_key = lineKey(out);
  return out;
}

export function repriceAll(items, bill) {
  const merged = new Map();
  for (const line of items.map((l) => priceLine(l, bill))) {
    const prev = merged.get(line.line_key);
    if (!prev) merged.set(line.line_key, line);
    else {
      const qty = prev.qty + line.qty;
      merged.set(line.line_key, { ...prev, qty, line_total: (toCents(prev.unit_price) * qty) / 100 });
    }
  }
  return [...merged.values()];
}

export function totalsOf(items) {
  const c = items.reduce((n, it) => n + toCents(it.unit_price) * Number(it.qty || 0), 0);
  return { subtotal_amount: c / 100, tax_amount: 0, total_amount: c / 100 };
}

export async function setDiscount(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const scope = body?.scope === "item" ? "item" : body?.scope === "bill" ? "bill" : "";
  const pct = Number(body?.pct);
  const reason = String(body?.reason || "").trim().slice(0, 120);
  if (!orderId || !scope) return fail(400, "Pick the bill or a dish to discount.");
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return fail(400, "Enter a discount from 0 to 100%.");
  if (pct > 0 && reason.length < 2) return fail(400, "A reason is required for a discount.");

  const { data: row, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, order_items, order_details, total_amount, payment_status, booking_status, updated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) return fail(400, error.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");
  const details = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  if (Array.isArray(details.payments) && details.payments.some((p) => !isDeposit(p))) return fail(409, "Part of this bill is already paid. Discounts must be added before payment.");
  const { data: waiting, error: wErr } = await admin
    .from("pos_payment_requests")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "pending")
    .limit(1);
  if (wErr) return fail(400, wErr.message);
  if (waiting?.length) return fail(409, "This bill is waiting on the POS. Cancel that payment first, then add the discount.");
  if (await heldPromo(admin, restaurantId, orderId)) return fail(409, "This bill already has a promo code.");

  let items = normalizeItems(extractOrderItems(row));
  let bill = billPct(details);
  let target = null;
  if (scope === "item") {
    const key = String(body?.line_key || "");
    target = items.find((l) => l.line_key === key);
    if (!target) return fail(404, "This dish is no longer on the bill.");
    items = items.map((l) => (l === target ? { ...l, discount_pct: pct } : l));
  } else {
    bill = pct;
  }
  const next = repriceAll(items, bill);
  const totals = totalsOf(next);
  if (totals.total_amount <= 0) return fail(400, "The bill can't be brought to zero. Remove the dishes instead.");

  const at = new Date().toISOString();
  const entry = {
    scope,
    pct,
    reason: pct > 0 ? reason : "Removed",
    by: userId,
    at,
    ...(target ? { line_key: target.line_key, name: target.name } : {}),
    before: Number(row.total_amount || 0),
    after: totals.total_amount,
  };
  const nextDetails = {
    ...details,
    items: next,
    order_items: next,
    discounts: [...(Array.isArray(details.discounts) ? details.discounts : []), entry].slice(-100),
  };
  if (scope === "bill") {
    if (pct > 0) nextDetails.bill_discount = { pct, reason, by: userId, at };
    else delete nextDetails.bill_discount;
  }
  const { data: saved, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({ order_items: next, order_details: nextDetails, ...totals, updated_at: at })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id, total_amount");
  if (upErr) return fail(400, upErr.message);
  if (!saved?.length) return fail(409, "This bill was just updated. Please try again.");
  return { status: 200, body: { ok: true, total_amount: totals.total_amount, discount: entry } };
}
