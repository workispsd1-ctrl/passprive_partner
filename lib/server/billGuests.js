import { randomUUID } from "node:crypto";
import { isBillClosed } from "@/lib/server/tableBill";
import { findLine, lineKey, mergeLines } from "@/lib/server/menuPricing";
import { extractOrderItems, normalizeItems } from "@/lib/server/settleBill";
import { guestsOf, splitState } from "@/lib/server/splitBill";

export const MAX_GUESTS = 30;

const fail = (status, error) => ({ status, body: { ok: false, error } });
const details = (row) => (row?.order_details && typeof row.order_details === "object" ? row.order_details : {});

export function cleanGuestName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

async function loadBill(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, guest_count, order_items, order_details, total_amount, payment_status, booking_status, updated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveBill(admin, restaurantId, row, patch) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("restaurant_id", restaurantId)
    .eq("updated_at", row.updated_at)
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function addGuest(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return fail(400, "order_id is required");
  const row = await loadBill(admin, restaurantId, orderId);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");
  const guests = guestsOf(row);
  if (guests.length >= MAX_GUESTS) return fail(400, "This table already has the most guests allowed.");

  const name = cleanGuestName(body?.name) || `Guest ${guests.length + 1}`;
  if (guests.some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail(409, `${name} is already on this table.`);
  const guest = { id: randomUUID().slice(0, 8), name, by: userId, at: new Date().toISOString() };
  const nextGuests = [...guests, guest];
  const headcount = Number(row.guest_count) || 0;
  const saved = await saveBill(admin, restaurantId, row, {
    order_details: { ...details(row), guests: nextGuests },
    ...(nextGuests.length > headcount ? { guest_count: nextGuests.length } : {}),
  });
  if (!saved) return fail(409, "This bill was just updated. Please try again.");
  return { status: 200, body: { ok: true, guest, guests: nextGuests } };
}

export async function setItemGuest(admin, restaurantId, body) {
  const orderId = String(body?.order_id || "").trim();
  const itemKey = String(body?.item_key || "").trim();
  const guestId = body?.guest_id ? String(body.guest_id) : null;
  if (!orderId || !itemKey) return fail(400, "order_id and item_key are required");
  const row = await loadBill(admin, restaurantId, orderId);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");

  const guest = guestId ? guestsOf(row).find((g) => g.id === guestId) : null;
  if (guestId && !guest) return fail(404, "This guest is no longer on the bill.");
  const items = normalizeItems(extractOrderItems(row));
  const idx = findLine(items, itemKey);
  if (idx < 0) return fail(404, "Item not found in this order.");
  const line = items[idx];
  const key = line.line_key || lineKey(line);
  const open = splitState(row).lines.find((l) => l.line_key === key);
  if (!open || open.open_qty < line.qty) return fail(409, `${line.name} is already paid, so it can't be moved.`);

  const { data: held, error: heldErr } = await admin
    .from("pos_payment_requests")
    .select("items")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .eq("status", "pending");
  if (heldErr) throw heldErr;
  if ((held || []).some((r) => (Array.isArray(r.items) ? r.items : []).some((it) => it.line_key === key))) {
    return fail(409, `${line.name} is in a split bill waiting on the POS. Cancel that bill first.`);
  }

  const moved = { ...line };
  delete moved.guest_id;
  delete moved.guest;
  if (guest) Object.assign(moved, { guest_id: guest.id, guest: guest.name });
  moved.line_key = lineKey(moved);
  const nextItems = mergeLines(items.map((it, i) => (i === idx ? moved : it)), []);
  const saved = await saveBill(admin, restaurantId, row, {
    order_items: nextItems,
    order_details: { ...details(row), items: nextItems, order_items: nextItems },
  });
  if (!saved) return fail(409, "This bill was just updated. Please try again.");
  return { status: 200, body: { ok: true, line_key: moved.line_key } };
}

export function renameGuestLines(items, guestId, name) {
  return items.map((it) => (String(it?.guest_id || "") === guestId ? { ...it, guest: name } : it));
}

export async function renameGuest(admin, restaurantId, body) {
  const orderId = String(body?.order_id || "").trim();
  const guestId = String(body?.guest_id || "").trim();
  const name = cleanGuestName(body?.name);
  if (!orderId || !guestId) return fail(400, "Pick the guest to rename.");
  if (!name) return fail(400, "Enter the guest's name.");
  const row = await loadBill(admin, restaurantId, orderId);
  if (!row?.id) return fail(404, "Order not found.");
  if (isBillClosed(row)) return fail(409, "This bill is already closed.");
  const guests = guestsOf(row);
  if (!guests.some((g) => g.id === guestId)) return fail(404, "This guest is no longer on the bill.");
  if (guests.some((g) => g.id !== guestId && g.name.toLowerCase() === name.toLowerCase())) return fail(409, `${name} is already on this table.`);
  const nextGuests = guests.map((g) => (g.id === guestId ? { ...g, name } : g));
  const items = renameGuestLines(normalizeItems(extractOrderItems(row)), guestId, name);
  const saved = await saveBill(admin, restaurantId, row, {
    order_items: items,
    order_details: { ...details(row), guests: nextGuests, items, order_items: items },
  });
  if (!saved) return fail(409, "This bill was just updated. Please try again.");
  return { status: 200, body: { ok: true, guests: nextGuests } };
}
