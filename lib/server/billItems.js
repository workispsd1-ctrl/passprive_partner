import { waiterStamp } from "@/lib/server/waiters";
import { isBillClosed } from "@/lib/server/tableBill";
import { discountProblem, findLine, itemDiscounts, menuIndex, mergeLines, priceLines } from "@/lib/server/menuPricing";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";
import { queueOrderTicket } from "@/lib/server/printJobs";
import { fitRequests, guestsOf, isDeposit, splitState } from "@/lib/server/splitBill";
import { hostTable } from "@/lib/server/changeTable";
import { billPct, priceLine } from "@/lib/server/billDiscount";

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
    .select("id, restaurant_id, table_no, guest_count, order_items, order_details, subtotal_amount, tax_amount, total_amount, payment_status, booking_status, updated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (rowErr) return fail(400, rowErr.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) {
    return fail(400, "This bill is already closed.");
  }

  const existingItems = normalizeItems(extractOrderItems(row));
  const idx = findLine(existingItems, itemKey);
  if (idx < 0) return fail(404, "Item not found in this order.");

  const line = existingItems[idx];
  const partPaid = Array.isArray(row.order_details?.payments) && row.order_details.payments.some((p) => !isDeposit(p));
  if (nextQty < line.qty && partPaid) {
    return fail(409, "Part of this bill is already paid, so items can't be removed.");
  }
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
        ? [...voids, { item_id: line.item_id, line_key: line.line_key || null, name: line.name, modifiers: line.modifiers || null, note: line.note || null, from_qty: line.qty, to_qty: nextQty, unit_price: line.unit_price, reason, by: userId, at: new Date().toISOString() }].slice(-200)
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
  await fitRequests(admin, restaurantId, orderId, splitState({ ...row, ...totals, order_items: nextItems, order_details: updatedDetails }));
  if (nextQty < line.qty) {
    await queueOrderTicket(admin, restaurantId, {
      cancel: true,
      by: userId,
      orderId,
      tableNo: row.table_no,
      guests: row.guest_count,
      lines: [{ ...line, qty: line.qty - nextQty }],
      notes: reason || null,
      source: "Till",
    }).catch((e) => console.error("cancel ticket failed", e?.message));
  }

  return { status: 200, body: { ok: true, order: updatedRows[0] || null } };
}

export async function addBillItems(admin, restaurantId, userId, body, source = "POS", { orderedBy = null } = {}) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");

  const [{ data: row, error: rowErr }, { data: restaurant, error: menuErr }] = await Promise.all([
    admin
      .from("restaurant_table_bookings")
      .select("id, table_no, guest_count, order_items, order_details, payment_status, booking_status, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle(),
  ]);
  if (rowErr || menuErr) return fail(400, (rowErr || menuErr).message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");

  const discountError = discountProblem(body?.items, true);
  if (discountError) return fail(400, discountError);
  const priced = priceLines(body?.items, menuIndex(restaurant?.menu_json), { guests: guestsOf(row), allowDiscount: true });
  if (!priced) return fail(400, "Some items are no longer on the menu. Refresh and try again.");

  const prevItems = normalizeItems(extractOrderItems(row));
  const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const bill = billPct(prevDetails);
  if (bill) priced.lines = priced.lines.map((l) => priceLine(l, bill));
  const nextItems = mergeLines(prevItems, priced.lines);
  const { data: updated, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({
      order_items: nextItems,
      order_details: {
        ...prevDetails,
        discounts: [...(Array.isArray(prevDetails.discounts) ? prevDetails.discounts : []), ...itemDiscounts(priced.lines, userId)].slice(-100),
        items: nextItems,
        order_items: nextItems,
        last_append_at: new Date().toISOString(),
        last_append_by: userId,
        ...(orderedBy ? { last_order_by: waiterStamp(orderedBy) } : {}),
        ...(!prevDetails.opened_by && orderedBy ? { opened_by: waiterStamp(orderedBy) } : {}),
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
  if (!body?.printed) await queueOrderTicket(admin, restaurantId, {
    by: orderedBy?.id || userId,
    orderId,
    tableNo: row.table_no,
    guests: row.guest_count,
    lines: priced.lines,
    added: prevItems.length > 0,
    source,
  });
  return { status: 200, body: { ok: true } };
}

export async function cancelBillItems(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 120);
  const asked = Array.isArray(body?.lines) ? body.lines : [];
  if (!orderId || !asked.length) return fail(400, "Pick the items to cancel.");
  if (!reason) return fail(400, "A reason is required to remove items.");

  const { data: row, error: rowErr } = await admin
    .from("restaurant_table_bookings")
    .select("id, restaurant_id, table_no, guest_count, order_items, order_details, subtotal_amount, tax_amount, total_amount, payment_status, booking_status, updated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (rowErr) return fail(400, rowErr.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(400, "This bill is already closed.");
  if (Array.isArray(row.order_details?.payments) && row.order_details.payments.some((p) => !isDeposit(p))) {
    return fail(409, "Part of this bill is already paid, so items can't be removed.");
  }

  let nextItems = normalizeItems(extractOrderItems(row));
  const removed = [];
  const at = new Date().toISOString();
  for (const a of asked) {
    const qty = Number(a?.qty);
    const idx = findLine(nextItems, String(a?.item_key || "").trim());
    if (idx < 0) return fail(404, "Item not found in this order.");
    const line = nextItems[idx];
    if (!Number.isInteger(qty) || qty < 1 || qty > line.qty) return fail(400, "Invalid quantity.");
    const left = line.qty - qty;
    removed.push({ line, qty, left });
    nextItems = left === 0 ? nextItems.filter((_, i) => i !== idx) : nextItems.map((it, i) => (i === idx ? { ...it, qty: left, line_total: Number((left * it.unit_price).toFixed(2)) } : it));
  }

  const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const voids = Array.isArray(prevDetails.voids) ? prevDetails.voids : [];
  const updatedDetails = {
    ...prevDetails,
    items: nextItems,
    order_items: nextItems,
    voids: [
      ...voids,
      ...removed.map(({ line, left }) => ({ item_id: line.item_id, line_key: line.line_key || null, name: line.name, modifiers: line.modifiers || null, note: line.note || null, from_qty: line.qty, to_qty: left, unit_price: line.unit_price, reason, by: userId, at })),
    ].slice(-200),
  };
  const totals = totalsFor(nextItems);
  const { data: updatedRows, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({ order_items: nextItems, order_details: updatedDetails, ...totals, updated_at: at })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id, order_items, subtotal_amount, tax_amount, total_amount");
  if (upErr) return fail(400, upErr.message);
  if (!updatedRows?.length) return fail(409, "This bill was just updated. Please try again.");
  await fitRequests(admin, restaurantId, orderId, splitState({ ...row, ...totals, order_items: nextItems, order_details: updatedDetails }));
  await queueOrderTicket(admin, restaurantId, {
    cancel: true,
    by: userId,
    orderId,
    tableNo: row.table_no,
    guests: row.guest_count,
    lines: removed.map(({ line, qty }) => ({ ...line, qty })),
    notes: reason,
    source: "Till",
  }).catch((e) => console.error("cancel ticket failed", e?.message));
  return { status: 200, body: { ok: true, order: updatedRows[0] || null } };
}

export async function setCovers(admin, restaurantId, body) {
  const orderId = String(body?.order_id || "").trim();
  const guests = Number(body?.guest_count);
  if (!orderId) return fail(400, "order_id is required");
  if (!Number.isInteger(guests) || guests < 0 || guests > 99) return fail(400, "Guests must be between 0 and 99.");
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .update({ guest_count: guests, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .neq("booking_status", "CANCELLED")
    .select("id, guest_count");
  if (error) return fail(400, error.message);
  if (!data?.length) return fail(409, "This bill is already closed.");
  return { status: 200, body: { ok: true, guest_count: data[0].guest_count } };
}

export async function voidTable(admin, restaurantId, userId, body, source = "Till") {
  const orderId = String(body?.order_id || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 120);
  if (!orderId) return fail(400, "order_id is required");
  if (!reason) return fail(400, "A reason is required to cancel a table.");
  const { data: row, error: rowErr } = await admin
    .from("restaurant_table_bookings")
    .select("id, table_no, guest_count, order_items, order_details, payment_status, booking_status, total_amount")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (rowErr) return fail(400, rowErr.message);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(400, "This bill is already closed.");
  if (Array.isArray(row.order_details?.payments) && row.order_details.payments.length) {
    return fail(409, "Part of this bill is already paid, so the table can't be cancelled.");
  }
  const { data: held } = await admin
    .from("pos_payment_requests")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "pending")
    .limit(1);
  if (held?.length) return fail(409, "This bill is split. Cancel the split bills first.");
  const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const at = new Date().toISOString();
  const { data: voided, error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({
      booking_status: "CANCELLED",
      order_details: { ...prevDetails, void: { reason, by: userId, at, total_amount: row.total_amount } },
      updated_at: at,
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .neq("booking_status", "PAID")
    .select("id");
  if (upErr) return fail(400, upErr.message);
  if (!voided?.length) return fail(409, "This bill is already closed.");
  if (Array.isArray(row.order_items) && row.order_items.length) {
    await queueOrderTicket(admin, restaurantId, {
      cancel: true,
      by: userId,
      orderId,
      tableNo: row.table_no,
      guests: row.guest_count,
      lines: row.order_items,
      notes: reason,
      source,
    }).catch((e) => console.error("cancel ticket failed", e?.message));
  }
  return { status: 200, body: { ok: true } };
}

function isTableOccupied(row) {
  return !isBillClosed(row);
}

export async function seatTable(admin, restaurantId, userId, body, { deposit = null, openedBy = null } = {}) {
  const seatTable = await hostTable(admin, restaurantId, Number(body?.table_no || 0), { extra: true });
  const guests = Number(body?.guest_count || 0);
  if (!Number.isInteger(seatTable) || seatTable <= 0) {
    return fail(400, "That table is not in your table layout.");
  }
  if (!Number.isInteger(guests) || guests < 0 || guests > 99) {
    return fail(400, "Guests must be between 0 and 99.");
  }
  const guestName = String(body?.customer_name || "").trim().slice(0, 80);
  if (!guestName) return fail(400, "Enter the customer's name.");
  const bookingId = body?.booking_id ? String(body.booking_id) : null;
  const guestPhone = String(body?.customer_phone || "").replace(/[^\d+]/g, "").slice(0, 16);
  if (guestPhone && !/^\+?\d{7,15}$/.test(guestPhone)) {
    return fail(400, "Enter a valid phone number.");
  }
  const { data: rows, error: rowsErr } = await admin
    .from("restaurant_table_bookings")
    .select("id, booking_status, payment_status")
    .eq("restaurant_id", restaurantId)
    .eq("table_no", seatTable)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (rowsErr) return fail(400, rowsErr.message);
  const open = (rows || []).find(isTableOccupied);
  if (open) return { status: 409, body: { ok: false, error: "table_occupied", order_id: open.id } };

  const { data: seated, error: seatErr } = await admin
    .from("restaurant_table_bookings")
    .insert({
      restaurant_id: restaurantId,
      table_no: seatTable,
      guest_count: guests,
      customer_name: guestName,
      customer_phone: guestPhone || null,
      order_items: [],
      order_details: {
        source_channel: "cashier_orders",
        cashier_user_id: userId,
        created_by: "cashier",
        ...(bookingId ? { booking_id: bookingId } : {}),
        ...(deposit ? { payments: [deposit] } : {}),
        ...(openedBy ? { opened_by: waiterStamp(openedBy) } : {}),
      },
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      payment_method: "CASH",
      payment_status: "PENDING",
      booking_status: "SEATED",
      source: "cashier",
    })
    .select("id, table_no, guest_count, booking_status")
    .single();
  if (seatErr) return fail(400, seatErr.message);
  return { status: 200, body: { ok: true, order: seated } };
}
