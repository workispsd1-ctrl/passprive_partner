import { billsInRange, mauritiusDayRange, summarize, toBill } from "@/lib/server/billHistory";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);

    const body = await readJson(request);
    const range = body.date ? mauritiusDayRange(body.date) : null;
    if (body.date && !range) return reply({ ok: false, error: "invalid_date" }, 400);

    let query = ctx.admin
      .from("restaurant_table_bookings")
      .select("id,table_no,total_amount,payment_method,payment_reference,booking_status,order_items,order_details,guest_count,customer_name,updated_at")
      .eq("restaurant_id", ctx.restaurantId)
      .in("payment_status", ["PAID", "COMPLETED"])
      .neq("booking_status", "CANCELLED");
    query = range
      ? query.gte("updated_at", range.start).lt("updated_at", range.end)
      : query.gte("updated_at", new Date(Date.now() - 30 * DAY_MS).toISOString());

    const { data, error } = await query.order("updated_at", { ascending: false }).limit(1000);
    if (error) return serverError(error);

    const rows = (data || []).map(toBill);
    const bills = range ? billsInRange(rows, range.start, range.end) : rows;
    return reply({ ok: true, bills, day: range ? summarize(bills) : null });
  } catch (error) {
    return serverError(error);
  }
}
