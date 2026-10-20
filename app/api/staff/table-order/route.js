import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const STATUSES = ["CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "CANCELLED"];
const MAX_ITEMS = 100;

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

// Prices come from the staff device, as on the cashier screen, so they are only range-checked here.
function parseItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const parsed = [];
  for (const item of items) {
    const price = Number(item?.price);
    const quantity = Number(item?.quantity ?? 1);
    const name = clean(item?.name);
    if (!name || !Number.isFinite(price) || price < 0 || price > 1_000_000) return null;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
    parsed.push({ item_id: clean(item?.item_id), name, price: Number(price.toFixed(2)), quantity });
  }
  return parsed;
}

// Table ordering is a pay-bill feature.
export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId } = ctx;

    const body = await readJson(request);
    const tableNo = Number(body.table_no);
    const orderItems = parseItems(body.items);
    if (!Number.isInteger(tableNo) || tableNo < 1) return reply({ ok: false, error: "invalid_table" }, 400);
    if (!orderItems) return reply({ ok: false, error: "invalid_items" }, 400);

    const totalAmount = Number(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
    const now = new Date().toISOString();
    const { data: inserted, error } = await admin
      .from("restaurant_table_bookings")
      .insert({
        restaurant_id: restaurantId,
        table_no: tableNo,
        order_items: orderItems,
        order_details: { items: orderItems, terminal_id: terminalId },
        total_amount: totalAmount,
        booking_status: "PLACED",
        payment_status: "PENDING",
        source: "staff_pad",
        notes: clean(body.notes, 500) || null,
        customer_name: "Staff Order",
        customer_phone: "",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error) return serverError(error);

    return reply({ ok: true, order_id: inserted.id, total_amount: totalAmount });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;

    const body = await readJson(request);
    const orderId = clean(body.order_id, 64);
    const status = clean(body.status, 20).toUpperCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return reply({ ok: false, error: "invalid_order" }, 400);
    }
    if (!STATUSES.includes(status)) return reply({ ok: false, error: "invalid_status" }, 400);

    const { data, error } = await admin
      .from("restaurant_table_bookings")
      .update({ booking_status: status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .select("id");
    if (error) return serverError(error);
    if (!data?.length) return reply({ ok: false, error: "order_not_found" }, 404);

    return reply({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
