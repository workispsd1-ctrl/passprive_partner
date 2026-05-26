import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

function isPendingBooking(status) {
  const s = String(status || "").toLowerCase();
  return s === "pending" || s === "payment_successful";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "restaurant_id and device_id are required" },
        { status: 400 },
      );
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });
    }

    // Verify device is paired
    const { data: deviceRow, error: deviceErr } = await admin
      .from("restaurant_staff_devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (deviceErr) return NextResponse.json({ ok: false, error: deviceErr.message }, { status: 400 });
    if (!deviceRow?.device_id) {
      return NextResponse.json({ ok: false, error: "Device not authorized." }, { status: 403 });
    }

    // Date boundaries
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    const todayStr = now.toISOString().split("T")[0];
    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Parallel fetch all four tables
    const [reviewsRes, ordersRes, tableOrdersRes, bookingsRes] = await Promise.all([
      admin
        .from("restaurant_reviews")
        .select("id,rating,comment,username_snapshot,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(100),

      admin
        .from("restaurant_orders")
        .select("id,order_number,customer_name,total_amount,payment_status,order_status,pickup_code,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(100),

      admin
        .from("restaurant_table_bookings")
        .select("id,customer_name,total_amount,payment_status,booking_status,table_no,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(100),

      admin
        .from("restaurant_bookings")
        .select("id,customer_name,booking_date,booking_time,party_size,status,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("booking_date", todayStr)
        .order("booking_time", { ascending: true })
        .limit(100),
    ]);

    const reviews = reviewsRes.data || [];
    const orders = ordersRes.data || [];
    const tableOrders = tableOrdersRes.data || [];
    const bookings = bookingsRes.data || [];

    // ── KPIs (today's data) ──────────────────────────────────────────────────
    const todayOrders = orders.filter(o => o.created_at >= todayISO);
    const todayTableOrders = tableOrders.filter(o => o.created_at >= todayISO);

    const pickupRevenue = todayOrders
      .filter(o => String(o.payment_status || "").toUpperCase() === "PAID")
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);

    const tableRevenue = todayTableOrders
      .filter(o => {
        const bs = String(o.booking_status || "").toUpperCase();
        const ps = String(o.payment_status || "").toUpperCase();
        return bs === "PAID" || ps === "PAID" || ps === "COMPLETED";
      })
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);

    const ratings = reviews.map(r => Number(r.rating || 0)).filter(r => r > 0);
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : null;

    const pendingBookingsList = bookings.filter(b => isPendingBooking(b.status));

    // ── Pending actions ──────────────────────────────────────────────────────
    const newPickupOrders = orders.filter(o => o.order_status === "NEW").length;
    const newTableOrders = tableOrders.filter(o => String(o.booking_status || "").toUpperCase() === "PLACED").length;
    const readyPickups = orders.filter(o => o.order_status === "READY_FOR_PICKUP").length;

    // ── Upcoming bookings (next 2 hours) ─────────────────────────────────────
    const upcomingBookings = bookings
      .map(b => {
        const dt = new Date(`${b.booking_date}T${String(b.booking_time || "00:00:00")}`);
        return { ...b, _dt: dt };
      })
      .filter(b => !isNaN(b._dt.getTime()) && b._dt >= now && b._dt <= plus2h)
      .sort((a, b) => a._dt - b._dt)
      .slice(0, 8)
      .map(({ _dt, ...b }) => b);

    return NextResponse.json({
      ok: true,
      kpis: {
        revenue: Math.round(pickupRevenue + tableRevenue),
        total_orders: todayOrders.length + todayTableOrders.length,
        pending_bookings: pendingBookingsList.length,
        rating: avgRating,
      },
      pending_actions: {
        new_orders: newPickupOrders + newTableOrders,
        ready_pickups: readyPickups,
        pending_bookings: pendingBookingsList.length,
      },
      upcoming_bookings: upcomingBookings,
      pickup_orders: orders.slice(0, 6),
      recent_reviews: reviews.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
