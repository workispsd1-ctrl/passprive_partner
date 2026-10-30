import { mauritiusDayRange } from "@/lib/server/billHistory";
import {
  bookingStats,
  isPaidTable,
  loadSales,
  pickupStats,
  serviceStats,
  tillStats,
  voidSummary,
} from "@/lib/server/tillStats";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const { admin, restaurantId } = ctx;

    const body = await readJson(request);
    const from = mauritiusDayRange(body.from);
    const to = mauritiusDayRange(body.to);
    if (!from || !to || to.end <= from.start) return reply({ ok: false, error: "invalid_date" }, 400);
    if ((new Date(to.end) - new Date(from.start)) / DAY_MS > MAX_DAYS) {
      return reply({ ok: false, error: "range_too_long" }, 400);
    }
    const { start } = from;
    const { end } = to;

    const [{ tables, sales }, bookingRes, collectRes] = await Promise.all([
      loadSales(admin, restaurantId, start, end),
      admin
        .from("restaurant_bookings")
        .select("status,party_size,source,payment_amount,cover_charge_amount")
        .eq("restaurant_id", restaurantId)
        .gte("booking_date", body.from)
        .lte("booking_date", body.to)
        .limit(5000),
      admin
        .from("restaurant_orders")
        .select("order_status,total_amount,accepted_at,ready_at,picked_up_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(5000),
    ]);
    if (bookingRes.error) return serverError(bookingRes.error);
    if (collectRes.error) return serverError(collectRes.error);

    const live = (status) => String(status || "").toUpperCase() !== "CANCELLED";
    const stats = tillStats(sales, tables.map((r) => voidSummary(r, start, end)));
    return reply({
      ok: true,
      stats: {
        ...stats,
        bookings: bookingStats(bookingRes.data || []),
        collect: pickupStats(collectRes.data || []),
        service: serviceStats(tables.filter((r) => isPaidTable(r) && live(r.booking_status)), stats.hours),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
