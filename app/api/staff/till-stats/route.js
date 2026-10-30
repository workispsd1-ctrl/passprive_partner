import { mauritiusDayRange } from "@/lib/server/billHistory";
import {
  billPaymentSale,
  bookingStats,
  isPaidTable,
  pickupSale,
  pickupStats,
  serviceStats,
  tableSale,
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

    const [tableRes, pickupRes, billRes, bookingRes, collectRes] = await Promise.all([
      admin
        .from("restaurant_table_bookings")
        .select("total_amount,tax_amount,payment_method,payment_status,booking_status,source,guest_count,order_items,order_details,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .gte("updated_at", start)
        .lt("updated_at", end)
        .order("updated_at", { ascending: false })
        .limit(5000),
      admin
        .from("restaurant_orders")
        .select("total_amount,tax_amount,payment_method,order_status,items,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),order_status.in.(PICKED_UP,COMPLETED)")
        .gte("updated_at", start)
        .lt("updated_at", end)
        .limit(5000),
      admin
        .from("payment_sessions")
        .select("amount_major,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_context", "BILL_PAYMENT")
        .in("status", ["VERIFIED_SUCCESS", "FINALIZED"])
        .gte("updated_at", start)
        .lt("updated_at", end)
        .limit(5000),
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
    if (tableRes.error) return serverError(tableRes.error);
    if (pickupRes.error) return serverError(pickupRes.error);
    if (billRes.error) return serverError(billRes.error);
    if (bookingRes.error) return serverError(bookingRes.error);
    if (collectRes.error) return serverError(collectRes.error);

    const tables = tableRes.data || [];
    const inPeriod = (sale) => new Date(sale.at) >= new Date(start) && new Date(sale.at) < new Date(end);
    const live = (status) => String(status || "").toUpperCase() !== "CANCELLED";
    const sales = [
      ...tables.filter((r) => isPaidTable(r) && live(r.booking_status)).map(tableSale).filter(inPeriod),
      ...(pickupRes.data || []).filter((r) => live(r.order_status)).map(pickupSale),
      ...(billRes.data || []).map(billPaymentSale),
    ];

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
