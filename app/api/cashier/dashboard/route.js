import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [bookingsRes, tableOrdersRes, pickupRes, paymentSessionsRes] = await Promise.all([
      ctx.admin
        .from("restaurant_bookings")
        .select("id,customer_name,customer_phone,booking_date,booking_time,party_size,status,created_at,booking_code", { count: "exact" })
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id,table_no,customer_name,customer_phone,booking_status,payment_status,total_amount,created_at,order_details,notes,order_items", { count: "exact" })
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.admin
        .from("restaurant_orders")
        .select("id,order_number,customer_name,customer_phone,order_status,payment_status,total_amount,created_at,pickup_code", { count: "exact" })
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.admin
        .from("payment_sessions")
        .select("id,payment_context,amount_major,currency_code,status,discount_amount,cashback_amount,merchant_trace,created_at,verified_at,tracking_id")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const paymentRows = paymentSessionsRes.data || [];
    const successStatuses = new Set(["VERIFIED_SUCCESS", "FINALIZED"]);
    const todayRevenue = paymentRows
      .filter((p) => successStatuses.has(String(p.status || "").toUpperCase()))
      .filter((p) => {
        const t = new Date(p.created_at || 0).getTime();
        return Number.isFinite(t) && t >= startOfDay.getTime() && t <= endOfDay.getTime();
      })
      .reduce((sum, p) => sum + Number(p.amount_major || 0), 0);

    return NextResponse.json({
      ok: true,
      profile: {
        user_name: ctx.userName,
        restaurant_name: ctx.restaurantName,
        restaurant_logo: ctx.restaurantLogo || "",
      },
      rows: {
        bookings: bookingsRes.data || [],
        table_orders: tableOrdersRes.data || [],
        pickup_orders: pickupRes.data || [],
        bill_payments: (tableOrdersRes.data || []).filter(
          (o) => String(o.payment_status || "").toUpperCase() !== "PAID"
        ),
        payment_sessions: paymentRows,
      },
      kpis: {
        bookings_total: bookingsRes.count || 0,
        bookings_pending: (bookingsRes.data || []).filter((b) => String(b.status || "").toLowerCase() === "pending").length,
        table_orders_total: tableOrdersRes.count || 0,
        table_orders_active: (tableOrdersRes.data || []).filter((o) => !["SERVED", "CANCELLED"].includes(String(o.booking_status || "").toUpperCase())).length,
        pickup_active: (pickupRes.data || []).filter((o) => ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"].includes(String(o.order_status || "").toUpperCase())).length,
        bill_payments_pending: (tableOrdersRes.data || []).filter((o) => String(o.payment_status || "").toUpperCase() !== "PAID").length,
        revenue_today: todayRevenue,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
