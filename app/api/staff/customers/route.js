import { groupCustomers } from "@/lib/server/customers";
import { reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const MAX_ROWS = 5000;

const isPaid = (...statuses) => statuses.some((s) => ["PAID", "COMPLETED"].includes(String(s || "").toUpperCase()));
const isCancelled = (status) => String(status || "").toUpperCase() === "CANCELLED";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const { admin, restaurantId } = ctx;

    const [tableRes, pickupRes] = await Promise.all([
      admin
        .from("restaurant_table_bookings")
        .select("customer_name,customer_phone,total_amount,payment_status,booking_status,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS),
      admin
        .from("restaurant_orders")
        .select("customer_name,customer_phone,total_amount,payment_status,order_status,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS),
    ]);
    if (tableRes.error) return serverError(tableRes.error);
    if (pickupRes.error) return serverError(pickupRes.error);

    const rows = [
      ...(tableRes.data || []).map((r) => ({
        name: r.customer_name,
        phone: r.customer_phone,
        amount: r.total_amount,
        at: r.created_at,
        paid: isPaid(r.payment_status, r.booking_status === "PAID" ? "PAID" : ""),
        cancelled: isCancelled(r.booking_status),
      })),
      ...(pickupRes.data || []).map((r) => ({
        name: r.customer_name,
        phone: r.customer_phone,
        amount: r.total_amount,
        at: r.created_at,
        paid: isPaid(r.payment_status),
        cancelled: isCancelled(r.order_status),
      })),
    ];

    return reply({ ok: true, customers: groupCustomers(rows) });
  } catch (error) {
    return serverError(error);
  }
}
