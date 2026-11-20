import { isBillClosed } from "@/lib/server/tableBill";
import { mergeLines } from "@/lib/server/menuPricing";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";
import { heldPromos } from "@/lib/server/promoCode";
import { fitRequests, partPayments, splitState } from "@/lib/server/splitBill";

const FIELDS =
  "id, table_no, guest_count, order_items, order_details, booking_status, payment_status, tip_amount, total_amount, created_at, updated_at";
const STAGE = ["SEATED", "PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED"];

const fail = (status, error) => ({ status, body: { ok: false, error } });
const cents = (n) => Math.round(Number(n || 0) * 100);
const details = (row) => (row?.order_details && typeof row.order_details === "object" ? row.order_details : {});

export function totalsFor(items) {
  const subtotalCents = items.reduce((sum, it) => sum + cents(it.unit_price) * Number(it.qty || 0), 0);
  return { subtotal_amount: subtotalCents / 100, tax_amount: 0, total_amount: subtotalCents / 100 };
}

export function earlierStage(a, b) {
  const ra = STAGE.indexOf(String(a || "").toUpperCase());
  const rb = STAGE.indexOf(String(b || "").toUpperCase());
  if (ra < 0) return b;
  if (rb < 0) return a;
  return ra <= rb ? a : b;
}

export function mergeBills(target, source, by, at) {
  const items = mergeLines(normalizeItems(extractOrderItems(target)), normalizeItems(extractOrderItems(source)));
  const payments = [...partPayments(target), ...partPayments(source)].map((p, i) => ({ ...p, no: i + 1 }));
  const prev = details(target);
  const mergedFrom = Array.isArray(prev.merged_from) ? prev.merged_from : [];
  const order_details = {
    ...prev,
    items,
    order_items: items,
    merged_from: [...mergedFrom, { order_id: source.id, table_no: Number(source.table_no), by, at }].slice(-50),
  };
  if (payments.length) order_details.payments = payments;
  return {
    order_items: items,
    order_details,
    ...totalsFor(items),
    guest_count: (Number(target.guest_count) || 0) + (Number(source.guest_count) || 0) || null,
    tip_amount: (cents(target.tip_amount) + cents(source.tip_amount)) / 100,
    booking_status: earlierStage(target.booking_status, source.booking_status),
    updated_at: at,
  };
}

export async function hostTable(admin, restaurantId, tableNo) {
  const { data, error } = await admin
    .from("restaurant_table_layouts")
    .select("id, table_no, attached_to")
    .eq("restaurant_id", restaurantId);
  if (error || !Array.isArray(data)) return tableNo;
  const own = data.find((t) => Number(t.table_no) === Number(tableNo));
  const host = own?.attached_to ? data.find((t) => t.id === own.attached_to) : null;
  return host ? Number(host.table_no) : tableNo;
}

async function freeTable(admin, restaurantId, tableNo) {
  await admin
    .from("restaurant_table_layouts")
    .update({ attached_to: null, attached_auto_release: false })
    .eq("restaurant_id", restaurantId)
    .eq("table_no", tableNo);
}

export async function changeTable(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const asked = Number(body?.to_table || 0);
  if (!orderId || !Number.isInteger(asked) || asked <= 0) return fail(400, "Pick a table.");
  const toTable = await hostTable(admin, restaurantId, asked);

  const [{ data: source, error: srcErr }, { data: layout }] = await Promise.all([
    admin.from("restaurant_table_bookings").select(FIELDS).eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle(),
    admin.from("restaurant_table_layouts").select("table_no").eq("restaurant_id", restaurantId).eq("table_no", toTable).maybeSingle(),
  ]);
  if (srcErr) return fail(400, srcErr.message);
  if (!source?.id || isBillClosed(source)) return fail(404, "This bill is already closed.");
  if (!layout) return fail(404, `T${toTable} is not on your floor plan.`);
  const fromTable = Number(source.table_no);
  if (fromTable === toTable) return fail(400, "The bill is already on this table.");

  const { data: onTarget, error: tgtErr } = await admin
    .from("restaurant_table_bookings")
    .select(FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("table_no", toTable)
    .order("created_at", { ascending: true });
  if (tgtErr) return fail(400, tgtErr.message);
  const target = (onTarget || []).find((r) => !isBillClosed(r));
  const at = new Date().toISOString();

  if (!target) {
    const { data: moved, error: moveErr } = await admin
      .from("restaurant_table_bookings")
      .update({ table_no: toTable, updated_at: at })
      .eq("id", source.id)
      .eq("restaurant_id", restaurantId)
      .eq("updated_at", source.updated_at)
      .select("id");
    if (moveErr) return fail(400, moveErr.message);
    if (!moved?.length) return fail(409, "This bill just changed. Try again.");
    await freeTable(admin, restaurantId, fromTable);
    return { status: 200, body: { ok: true, mode: "moved", order_id: source.id, table_no: toTable } };
  }

  const promos = await heldPromos(admin, restaurantId, [source.id, target.id]);
  if (promos.size) return fail(409, "A bill with a promo code can't be merged. Remove the promo code first.");

  const patch = mergeBills(target, source, userId, at);
  const { data: merged, error: mergeErr } = await admin
    .from("restaurant_table_bookings")
    .update(patch)
    .eq("id", target.id)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", target.updated_at)
    .select("id, total_amount");
  if (mergeErr) return fail(400, mergeErr.message);
  if (!merged?.length) return fail(409, `T${toTable}'s bill just changed. Try again.`);

  const { data: closed } = await admin
    .from("restaurant_table_bookings")
    .update({
      booking_status: "CANCELLED",
      order_details: { ...details(source), payments: [], merged_into: { order_id: target.id, table_no: toTable, by: userId, at } },
      tip_amount: 0,
      updated_at: at,
    })
    .eq("id", source.id)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", source.updated_at)
    .select("id");
  if (!closed?.length) {
    await admin
      .from("restaurant_table_bookings")
      .update({
        order_items: target.order_items,
        order_details: target.order_details,
        ...totalsFor(normalizeItems(extractOrderItems(target))),
        guest_count: target.guest_count,
        tip_amount: target.tip_amount,
        booking_status: target.booking_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("restaurant_id", restaurantId);
    return fail(409, "This bill just changed. Try again.");
  }

  await admin
    .from("pos_payment_requests")
    .update({ order_id: target.id, updated_at: at })
    .eq("restaurant_id", restaurantId)
    .eq("order_id", source.id)
    .eq("status", "pending");
  await fitRequests(admin, restaurantId, target.id, splitState({ ...target, ...patch }));
  await freeTable(admin, restaurantId, fromTable);
  return {
    status: 200,
    body: { ok: true, mode: "merged", order_id: target.id, table_no: toTable, total_amount: merged[0].total_amount },
  };
}
