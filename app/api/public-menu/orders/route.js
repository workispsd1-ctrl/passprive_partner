import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/deviceSession";
import { PAY_BILL_PLANS } from "@/lib/server/plan";

const MAX_LINES = 100;
const MAX_QTY = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

const PUBLIC_ORDER_FIELDS =
  "id, session_id:order_details->>session_id, booking_status, payment_status, payment_method, notes, order_items, subtotal_amount, tax_amount, total_amount, updated_at";

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function fail(message, status = 400) {
  return reply({ ok: false, error: message }, status);
}

function serverError(error) {
  console.error("[public-menu-orders]", error);
  return fail("Something went wrong. Please try again.", 500);
}

const money = (v) => Number(Number(v || 0).toFixed(2));

function sameSecret(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function isOpen(row) {
  const booking = String(row?.booking_status || "").toUpperCase();
  const payment = String(row?.payment_status || "").toUpperCase();
  return !["CANCELLED", "PAID", "COMPLETED"].includes(booking) && !["PAID", "COMPLETED"].includes(payment);
}

function menuPrices(menuJson) {
  let menu = menuJson;
  if (typeof menu === "string") {
    try {
      menu = JSON.parse(menu);
    } catch {
      menu = null;
    }
  }
  const prices = new Map();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const price = Number(item?.price);
      if (!item?.id || item.is_available === false || !Number.isFinite(price) || price < 0) continue;
      prices.set(String(item.id), { name: String(item.name || "Item").slice(0, 120), price: money(price) });
    }
  }
  return prices;
}

function priceItems(rawItems, prices) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_LINES) return null;
  const lines = new Map();
  for (const raw of rawItems) {
    const itemId = String(raw?.item_id || raw?.id || "");
    const qty = Number(raw?.qty);
    const menuItem = prices.get(itemId);
    if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
    const prev = lines.get(itemId);
    lines.set(itemId, { item_id: itemId, name: menuItem.name, qty: (prev?.qty || 0) + qty, unit_price: menuItem.price });
  }
  return [...lines.values()].map((l) => ({ ...l, line_total: money(l.qty * l.unit_price) }));
}

function mergeItems(existing, incoming) {
  const map = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...incoming]) {
    const key = String(item?.item_id || item?.name || "");
    if (!key) continue;
    const prev = map.get(key);
    const qty = Number(item?.qty || 0);
    const line = Number(item?.line_total ?? qty * Number(item?.unit_price || 0));
    map.set(key, prev
      ? { ...prev, qty: prev.qty + qty, line_total: money(prev.line_total + line) }
      : { item_id: item?.item_id || key, name: item?.name || "", qty, unit_price: money(item?.unit_price), line_total: money(line) });
  }
  return [...map.values()];
}

async function resolveTable(admin, request, body) {
  const restaurantId = String(body.restaurant_id || "").trim();
  const tableNo = Number(body.table_no);
  if (!UUID_RE.test(restaurantId) || !Number.isInteger(tableNo) || tableNo <= 0) {
    return { error: fail("Scan the QR code on your table to order.", 403) };
  }

  const [{ data: restaurant, error: restErr }, { data: table, error: tableErr }] = await Promise.all([
    admin.from("restaurants").select("id, is_active, service_level, owner_user_id, menu_json").eq("id", restaurantId).maybeSingle(),
    admin.from("restaurant_table_layouts").select("id, qr_key").eq("restaurant_id", restaurantId).eq("table_no", tableNo).maybeSingle(),
  ]);
  if (restErr) return { error: serverError(restErr) };
  if (tableErr) return { error: serverError(tableErr) };
  if (!restaurant?.is_active || !PAY_BILL_PLANS.includes(String(restaurant.service_level || "").toLowerCase())) {
    return { error: fail("This restaurant isn't taking table orders right now.", 403) };
  }
  if (!table) return { error: fail("Scan the QR code on your table to order.", 403) };

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data: auth } = await admin.auth.getUser(token);
    const userId = auth?.user?.id;
    if (!userId) return { error: fail("Please sign in again.", 401) };
    let isStaff = restaurant.owner_user_id === userId;
    if (!isStaff) {
      const { data: staffRow, error: staffErr } = await admin
        .from("restaurant_staff")
        .select("user_id")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (staffErr) return { error: serverError(staffErr) };
      isStaff = Boolean(staffRow);
    }
    if (!isStaff) return { error: fail("You don't have access to this restaurant.", 403) };
    return { restaurant, tableNo, staffUserId: userId };
  }

  const key = String(body.key || "");
  if (!sameSecret(key, table.qr_key)) return { error: fail("Scan the QR code on your table to order.", 403) };
  return { restaurant, tableNo, staffUserId: null };
}

async function findOpenOrder(admin, restaurantId, tableNo, { orderId, sessionId } = {}) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .select(PUBLIC_ORDER_FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("table_no", tableNo)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const open = (data || []).filter(isOpen);
  return (
    (orderId && open.find((o) => String(o.id) === orderId)) ||
    (sessionId && open.find((o) => o.session_id === sessionId)) ||
    open[0] ||
    null
  );
}

async function upsertOrder(admin, ctx, body) {
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const items = priceItems(payload.order_items, menuPrices(ctx.restaurant.menu_json));
  if (!items) return fail("Some items in your cart are no longer available. Please refresh the menu.");

  const subtotal = money(items.reduce((sum, it) => sum + it.line_total, 0));
  const tax = 0;
  const notes = String(payload.notes || "").trim().slice(0, 500) || null;
  const sessionId = UUID_RE.test(String(payload.session_id || "")) ? String(payload.session_id) : crypto.randomUUID();

  const name = String(payload.customer_name || "").trim().slice(0, 80);
  const phone = String(payload.customer_phone || "").replace(/\D/g, "");
  const loyalty = !ctx.staffUserId && Boolean(payload.order_details?.loyalty_enrolled) && name && phone.length === 8;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await findOpenOrder(admin, ctx.restaurant.id, ctx.tableNo, {
      orderId: String(body.target_order_id || ""),
      sessionId,
    });

    if (!open) {
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .insert({
          restaurant_id: ctx.restaurant.id,
          table_no: ctx.tableNo,
          customer_name: ctx.staffUserId ? "Staff Order" : loyalty ? name : "Guest",
          customer_phone: loyalty ? phone : "",
          order_items: items,
          order_details: {
            session_id: sessionId,
            loyalty_enrolled: loyalty,
            ...(ctx.staffUserId ? { placed_by: "staff", staff_user_id: ctx.staffUserId } : {}),
          },
          subtotal_amount: subtotal,
          tax_amount: tax,
          total_amount: money(subtotal + tax),
          notes,
          payment_method: ctx.staffUserId ? "CASH" : "IVERI",
          payment_status: "PENDING",
          booking_status: "PLACED",
          source: ctx.staffUserId ? "bearer_platform" : "public_menu",
        })
        .select("id")
        .single();
      if (error) return serverError(error);
      return reply({ ok: true, order_id: data.id });
    }

    const { data: current, error: currentErr } = await admin
      .from("restaurant_table_bookings")
      .select("order_items, order_details, subtotal_amount, tax_amount, total_amount, updated_at")
      .eq("id", open.id)
      .single();
    if (currentErr) return serverError(currentErr);

    const update = {
      order_items: mergeItems(current.order_items, items),
      order_details: { ...(current.order_details || {}), session_id: current.order_details?.session_id || sessionId },
      subtotal_amount: money(Number(current.subtotal_amount || 0) + subtotal),
      tax_amount: money(Number(current.tax_amount || 0) + tax),
      total_amount: money(Number(current.total_amount || 0) + subtotal + tax),
      booking_status: "PLACED",
      updated_at: new Date().toISOString(),
    };
    if (notes) update.notes = notes;
    if (loyalty) Object.assign(update, { customer_name: name, customer_phone: phone });

    const { data: saved, error: saveErr } = await admin
      .from("restaurant_table_bookings")
      .update(update)
      .eq("id", open.id)
      .eq("updated_at", current.updated_at)
      .select("id");
    if (saveErr) return serverError(saveErr);
    if (saved?.length) return reply({ ok: true, order_id: open.id });
  }
  return fail("The table's order was just updated. Please try again.", 409);
}

export async function POST(request) {
  try {
    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    let body;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request.");
    }
    if (!body || typeof body !== "object") return fail("Invalid request.");

    const ctx = await resolveTable(admin, request, body);
    if (ctx.error) return ctx.error;

    const action = String(body.action || "");
    const orderId = String(body.order_id || "");

    if (action === "find_open_by_session" || action === "find_open_by_table") {
      const order = await findOpenOrder(admin, ctx.restaurant.id, ctx.tableNo, { sessionId: String(body.session_id || "") });
      return reply({ ok: true, order: order ? { id: order.id, session_id: order.session_id } : null });
    }

    if (action === "get_status") {
      if (!UUID_RE.test(orderId)) return reply({ ok: true, order: null });
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .select(PUBLIC_ORDER_FIELDS)
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurant.id)
        .eq("table_no", ctx.tableNo)
        .maybeSingle();
      if (error) return serverError(error);
      return reply({ ok: true, order: data || null });
    }

    if (action === "upsert") return await upsertOrder(admin, ctx, body);

    if (action === "mark_cash") {
      if (!UUID_RE.test(orderId)) return fail("Order not found.", 404);
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .update({ payment_method: "CASH", payment_status: "PENDING", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurant.id)
        .eq("table_no", ctx.tableNo)
        .not("booking_status", "in", "(CANCELLED,PAID)")
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .select("id");
      if (error) return serverError(error);
      if (!data?.length) return fail("Order not found.", 404);
      return reply({ ok: true });
    }

    return fail("Unsupported action.");
  } catch (error) {
    return serverError(error);
  }
}
