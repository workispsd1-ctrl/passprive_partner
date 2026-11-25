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

export function billOff(details) {
  const amount = Number(details?.bill_discount?.amount || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

export function priceLine(line, bill = 0, factor = 1) {
  const list = line.list_price != null ? Number(line.list_price) : Number(line.unit_price || 0);
  const dish = Number(line.discount_pct || 0);
  const listCents = toCents(list);
  const offCents = dish > 0 ? 0 : Math.min(listCents, Math.max(0, toCents(line.discount_amount || 0)));
  const out = { ...line };
  delete out.list_price;
  delete out.discount_pct;
  delete out.discount_amount;
  delete out.bill_adj;
  if (dish > 0) out.discount_pct = dish;
  if (offCents > 0) out.discount_amount = offCents / 100;
  const base = offCents > 0 ? listCents - offCents : listCents * (1 - dish / 100);
  const unitCents = Math.round(base * (1 - bill / 100) * factor);
  if (dish > 0 || offCents > 0 || bill > 0 || factor < 1) out.list_price = list;
  out.unit_price = unitCents / 100;
  out.line_total = (unitCents * Number(line.qty || 0)) / 100;
  out.line_key = lineKey(out);
  return out;
}

export function splitDiscount(items, target, units, pct, amount = 0) {
  const off = (l) => ({ ...l, discount_pct: amount > 0 ? 0 : pct, discount_amount: amount > 0 ? amount : 0 });
  if (units >= target.qty) return items.map((l) => (l === target ? off(l) : l));
  return items.flatMap((l) => (l === target ? [{ ...l, qty: l.qty - units }, off({ ...l, qty: units })] : [l]));
}

export function setLinePrice(items, target, units, price) {
  const menu = target.menu_price != null ? Number(target.menu_price) : target.list_price != null ? Number(target.list_price) : Number(target.unit_price || 0);
  const next = { ...target, list_price: price };
  if (toCents(price) === toCents(menu)) {
    delete next.custom_price;
    delete next.menu_price;
  } else {
    next.custom_price = price;
    next.menu_price = menu;
  }
  if (units >= target.qty) return items.map((l) => (l === target ? next : l));
  return items.flatMap((l) => (l === target ? [{ ...l, qty: l.qty - units }, { ...next, qty: units }] : [l]));
}

function mergeByKey(lines) {
  const merged = new Map();
  for (const line of lines) {
    const prev = merged.get(line.line_key);
    if (!prev) merged.set(line.line_key, line);
    else {
      const qty = prev.qty + line.qty;
      merged.set(line.line_key, { ...prev, qty, line_total: (toCents(prev.unit_price) * qty) / 100 });
    }
  }
  return [...merged.values()];
}

const sumCents = (lines) => lines.reduce((n, l) => n + toCents(l.unit_price) * Number(l.qty || 0), 0);

export function repriceAll(items, bill, amount = 0) {
  const plain = items.map((l) => {
    const c = { ...l };
    delete c.bill_adj;
    return c;
  });
  if (!(amount > 0)) return mergeByKey(plain.map((l) => priceLine(l, bill)));
  const first = mergeByKey(plain.map((l) => priceLine(l, 0)));
  const gross = sumCents(first);
  const want = Math.min(toCents(amount), gross);
  if (!gross || !want) return first;
  let lines = mergeByKey(plain.map((l) => priceLine(l, 0, 1 - want / gross)));
  const left = want - (gross - sumCents(lines));
  if (!left) return lines;
  const room = (l) => toCents(l.unit_price) - left >= 0;
  const pick = (only) =>
    lines.reduce((best, l, i) => (only(l) && room(l) && (best < 0 || toCents(l.unit_price) > toCents(lines[best].unit_price)) ? i : best), -1);
  let i = pick((l) => l.qty === 1);
  if (i < 0) i = pick(() => true);
  if (i < 0) return lines;
  const line = lines[i];
  const unit = toCents(line.unit_price) - left;
  const adj = { ...line, qty: 1, unit_price: unit / 100, line_total: unit / 100, bill_adj: true };
  adj.line_key = lineKey(adj);
  const rest = line.qty > 1 ? [{ ...line, qty: line.qty - 1, line_total: (toCents(line.unit_price) * (line.qty - 1)) / 100 }] : [];
  lines = [...lines.slice(0, i), ...rest, adj, ...lines.slice(i + 1)];
  return lines;
}

export function totalsOf(items) {
  const c = items.reduce((n, it) => n + toCents(it.unit_price) * Number(it.qty || 0), 0);
  return { subtotal_amount: c / 100, tax_amount: 0, total_amount: c / 100 };
}

export async function setDiscount(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const scope = ["item", "bill", "price"].includes(body?.scope) ? body.scope : "";
  const useAmount = scope !== "price" && body?.amount != null && body?.amount !== "" && Number(body.amount) > 0;
  const amount = useAmount ? Math.round(Number(body.amount) * 100) / 100 : 0;
  const pct = scope === "price" || useAmount ? 0 : Number(body?.pct);
  const price = Math.round(Number(body?.price) * 100) / 100;
  const reason = String(body?.reason || "").trim().slice(0, 120);
  if (!orderId || !scope) return fail(400, "Pick the bill or a dish to discount.");
  if (scope === "price") {
    if (!Number.isFinite(price) || price < 0 || price > 100000) return fail(400, "Enter a price from 0 to 100,000.");
  } else {
    if (useAmount) {
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return fail(400, "Enter a discount amount above 0.");
    } else if (!Number.isInteger(pct) || pct < 0 || pct > 100) return fail(400, "Enter a discount from 0 to 100%.");
    if ((pct > 0 || amount > 0) && reason.length < 2) return fail(400, "A reason is required for a discount.");
  }

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
  if (Array.isArray(details.payments) && details.payments.some((p) => !isDeposit(p))) {
    return fail(409, scope === "price" ? "Part of this bill is already paid. Prices must be changed before payment." : "Part of this bill is already paid. Discounts must be added before payment.");
  }
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
  let billAmount = billOff(details);
  let target = null;
  let fromPrice = null;
  if (scope === "item" || scope === "price") {
    const key = String(body?.line_key || "");
    target = items.find((l) => l.line_key === key);
    if (!target) return fail(404, "This dish is no longer on the bill.");
    const units = body?.qty === undefined || body?.qty === null ? target.qty : Number(body.qty);
    if (!Number.isInteger(units) || units < 1 || units > target.qty) return fail(400, "Pick how many of this dish get the discount.");
    if (scope === "price") {
      fromPrice = target.list_price != null ? Number(target.list_price) : Number(target.unit_price || 0);
      items = setLinePrice(items, target, units, price);
    } else {
      items = splitDiscount(items, target, units, pct, amount);
    }
  } else {
    bill = pct;
    billAmount = amount;
  }
  const next = repriceAll(items, bill, billAmount);
  const totals = totalsOf(next);

  const at = new Date().toISOString();
  const entry = {
    scope,
    ...(scope === "price" ? { price, from: fromPrice, reason: reason || "Price changed" } : useAmount ? { amount, reason } : { pct, reason: pct > 0 ? reason : "Removed" }),
    by: userId,
    at,
    ...(target ? { line_key: target.line_key, name: target.name, qty: body?.qty ?? target.qty } : {}),
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
    if (amount > 0) nextDetails.bill_discount = { amount, reason, by: userId, at };
    else if (pct > 0) nextDetails.bill_discount = { pct, reason, by: userId, at };
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
