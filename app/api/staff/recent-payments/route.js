import { NextResponse } from "next/server";
import { requireTerminal, serverError } from "../_terminal";

const LIMIT = 5;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;

    const [tableRes, pickupRes, billRes] = await Promise.all([
      admin
        .from("restaurant_table_bookings")
        .select("id,table_no,total_amount,payment_method,booking_status,order_details,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),booking_status.eq.PAID")
        .order("updated_at", { ascending: false })
        .limit(LIMIT + 4),
      admin
        .from("restaurant_orders")
        .select("id,order_number,total_amount,payment_method,order_status,updated_at")
        .eq("restaurant_id", restaurantId)
        .in("payment_status", ["PAID", "COMPLETED"])
        .order("updated_at", { ascending: false })
        .limit(LIMIT + 4),
      admin
        .from("payment_sessions")
        .select("id,tracking_id,amount_major,payment_provider,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_context", "BILL_PAYMENT")
        .in("status", ["VERIFIED_SUCCESS", "FINALIZED"])
        .order("updated_at", { ascending: false })
        .limit(LIMIT),
    ]);
    if (tableRes.error) return serverError(tableRes.error);
    if (pickupRes.error) return serverError(pickupRes.error);
    if (billRes.error) return serverError(billRes.error);

    const isCancelled = (status) => String(status || "").toUpperCase() === "CANCELLED";

    const payments = [
      ...(tableRes.data || [])
        .filter((r) => !isCancelled(r.booking_status))
        .map((r) => ({
          id: `table-${r.id}`,
          kind: "table",
          reference: `T-${String(r.id).slice(0, 8).toUpperCase()}`,
          table_no: r.table_no,
          amount: Number(r.total_amount || 0),
          method: String(r.order_details?.payment?.method || r.payment_method || "ONLINE").toUpperCase(),
          at: r.order_details?.payment?.at || r.updated_at,
        })),
      ...(pickupRes.data || [])
        .filter((r) => !isCancelled(r.order_status))
        .map((r) => ({
          id: `pickup-${r.id}`,
          kind: "pickup",
          reference: r.order_number,
          order_number: r.order_number,
          amount: Number(r.total_amount || 0),
          method: String(r.payment_method || "ONLINE").toUpperCase(),
          at: r.updated_at,
        })),
      ...(billRes.data || []).map((r) => ({
        id: `bill-${r.id}`,
        kind: "bill",
        reference: r.tracking_id || `O-${String(r.id).slice(0, 8).toUpperCase()}`,
        amount: Number(r.amount_major || 0),
        method: "ONLINE",
        at: r.updated_at,
      })),
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, LIMIT);

    return NextResponse.json({ ok: true, payments });
  } catch (error) {
    return serverError(error);
  }
}
