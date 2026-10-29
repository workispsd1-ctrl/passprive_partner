import { fromCents, menuIndex, priceLines } from "@/lib/server/menuPricing";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const STATUSES = ["CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "CANCELLED"];

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId, userId } = ctx;

    const body = await readJson(request);
    const tableNo = Number(body.table_no);
    if (!Number.isInteger(tableNo) || tableNo < 1) return reply({ ok: false, error: "invalid_table" }, 400);

    const { data: restaurant, error: menuErr } = await admin
      .from("restaurants")
      .select("menu_json")
      .eq("id", restaurantId)
      .maybeSingle();
    if (menuErr) return serverError(menuErr);

    const priced = priceLines(body.items, menuIndex(restaurant?.menu_json));
    if (!priced) return reply({ ok: false, error: "invalid_items" }, 400);

    const totalAmount = fromCents(priced.subtotalCents);
    const now = new Date().toISOString();
    const { data: inserted, error } = await admin
      .from("restaurant_table_bookings")
      .insert({
        restaurant_id: restaurantId,
        table_no: tableNo,
        order_items: priced.lines,
        order_details: { items: priced.lines, terminal_id: terminalId, staff_user_id: userId },
        subtotal_amount: totalAmount,
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

    return reply({ ok: true, order_id: inserted.id, items: priced.lines, total_amount: totalAmount });
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
