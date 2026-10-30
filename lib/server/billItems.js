import { isBillClosed } from "@/lib/server/tableBill";
import { menuIndex, priceLines } from "@/lib/server/menuPricing";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";

const fail = (status, error) => ({ status, body: { ok: false, error } });

function totalsFor(items) {
  const subtotalCents = items.reduce((sum, it) => sum + Math.round(Number(it.unit_price || 0) * 100) * Number(it.qty || 0), 0);
  return {
    subtotal_amount: subtotalCents / 100,
    tax_amount: 0,
    total_amount: subtotalCents / 100,
  };
}

export async function setBillItemQty(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const itemKey = String(body?.item_key || "").trim();
  const nextQty = Number(body?.qty);
  const reason = String(body?.reason || "").trim().slice(0, 120);
  if (!orderId || !itemKey) {
    return fail(400, "order_id and item_key are required");
  }
  if (!Number.isInteger(nextQty) || nextQty < 0 || nextQty > 999) {
    return fail(400, "Invalid quantity.");
  }

  const { data: row, error: rowErr } = await admin
    .from("restaurant_table_bookings")
    .select("id, restaurant_id, order_items, order_details, subtotal_amount, tax_amount, total_amount, payment_status, booking_status, updated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (rowErr) return fail(400, rowErr.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) {
    return fail(400, "This bill is already closed.");
  }

  const existingItems = normalizeItems(extractOrderItems(row));
  const idx = existingItems.findIndex(
    (it) => String(it.item_id || it.name || "").toLowerCase() === itemKey.toLowerCase()
  );
  if (idx < 0) return fail(404, "Item not found in this order.");

  const line = existingItems[idx];
  if (nextQty < line.qty && !reason) {
    return fail(400, "A reason is required to remove items.");
  }
  const nextItems =
    nextQty === 0
      ? existingItems.filter((_, i) => i !== idx)
      : existingItems.map((it, i) =>
          i === idx ? { ...it, qty: nextQty, line_total: Number((nextQty * it.unit_price).toFixed(2)) } : it
        );

  const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const voids = Array.isArray(prevDetails.voids) ? prevDetails.voids : [];
  const updatedDetails = {
    ...prevDetails,
    items: nextItems,
    order_items: nextItems,
    voids:
      nextQty < line.qty
        ? [...voids, { item_id: line.item_id, name: line.name, from_qty: line.qty, to_qty: nextQty, unit_price: line.unit_price, reason, by: userId, at: new Date().toISOString() }].slice(-200)
        : voids,
  };

  const totals = totalsFor(nextItems);
  const { data: updatedRows, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({
      order_items: nextItems,
      order_details: updatedDetails,
      ...totals,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id, order_items, subtotal_amount, tax_amount, total_amount");
  if (upErr) return fail(400, upErr.message);
  if (!updatedRows?.length) {
    return fail(409, "This bill was just updated. Please try again.");
  }

  return { status: 200, body: { ok: true, order: updatedRows[0] || null } };
}

function mergeLines(existing, incoming) {
  const merged = new Map(existing.map((line) => [String(line.item_id || line.name), { ...line }]));
  for (const line of incoming) {
    const key = String(line.item_id || line.name);
    const prev = merged.get(key);
    const qty = (prev?.qty || 0) + line.qty;
    merged.set(key, { ...line, qty, line_total: Number((qty * line.unit_price).toFixed(2)) });
  }
  return [...merged.values()];
}

export async function addBillItems(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");

  const [{ data: row, error: rowErr }, { data: restaurant, error: menuErr }] = await Promise.all([
    admin
      .from("restaurant_table_bookings")
      .select("id, order_items, order_details, payment_status, booking_status, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle(),
  ]);
  if (rowErr || menuErr) return fail(400, (rowErr || menuErr).message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");

  const priced = priceLines(body?.items, menuIndex(restaurant?.menu_json));
  if (!priced) return fail(400, "Some items are no longer on the menu. Refresh and try again.");

  const nextItems = mergeLines(normalizeItems(extractOrderItems(row)), priced.lines);
  const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const { data: updated, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({
      order_items: nextItems,
      order_details: {
        ...prevDetails,
        items: nextItems,
        order_items: nextItems,
        last_append_at: new Date().toISOString(),
        last_append_by: userId,
      },
      ...totalsFor(nextItems),
      booking_status: "PLACED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id");
  if (upErr) return fail(400, upErr.message);
  if (!updated?.length) return fail(409, "This bill was just updated. Please try again.");
  return { status: 200, body: { ok: true } };
}
