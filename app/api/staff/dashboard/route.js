import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

function isPendingBooking(status) {
  const s = String(status || "").toLowerCase();
  return s === "pending" || s === "payment_successful" || s === "payment_successfull";
}

function getRangeDates(range) {
  const now = new Date();

  if (range === "yesterday") {
    const from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setDate(to.getDate() - 1);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  if (range === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // Default: today
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();
    const range = String(body?.range || "today").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "restaurant_id and device_id are required" },
        { status: 400 }
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

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const { from: rangeFrom, to: rangeTo } = getRangeDates(range);
    const fromISO = rangeFrom.toISOString();
    const toISO = rangeTo.toISOString();

    // 7 days ago for chart (always fixed)
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Parallel fetch
    const [
      reviewsRes,
      ordersRes,
      tableOrdersRes,
      bookingsRes,
      liveTableRes,
      todayBookingsRes,
      chartOrdersRes,
    ] = await Promise.all([
      // 1. Reviews — all time for rating
      admin
        .from("restaurant_reviews")
        .select("id,rating,comment,username_snapshot,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),

      // 2. Orders — range-filtered for KPIs
      admin
        .from("restaurant_orders")
        .select("id,order_number,customer_name,total_amount,payment_status,order_status,pickup_code,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(200),

      // 3. Table orders — range-filtered for KPIs
      admin
        .from("restaurant_table_bookings")
        .select("id,customer_name,total_amount,payment_status,booking_status,table_no,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(200),

      // 4. Bookings — range-filtered for KPIs
      admin
        .from("restaurant_bookings")
        .select("id,customer_name,booking_date,booking_time,party_size,status,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(200),

      // 5. Live table orders — all active (not range-filtered)
      admin
        .from("restaurant_table_bookings")
        .select("id,customer_name,total_amount,payment_status,booking_status,table_no,updated_at,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),

      // 6. Today's bookings for upcoming 2-hour section
      admin
        .from("restaurant_bookings")
        .select("id,customer_name,booking_date,booking_time,party_size,status,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("booking_date", todayStr)
        .order("booking_time", { ascending: true })
        .limit(20),

      // 7. Last-7-days orders for performance chart
      admin
        .from("restaurant_orders")
        .select("id,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true })
        .limit(500),
    ]);

    const reviews = reviewsRes.data || [];
    const orders = ordersRes.data || [];
    const tableOrders = tableOrdersRes.data || [];
    const bookings = bookingsRes.data || [];
    const allLiveTableOrders = liveTableRes.data || [];
    const todayBookings = todayBookingsRes.data || [];
    const chartOrders = chartOrdersRes.data || [];

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const pickupRevenue = orders
      .filter(o => String(o.payment_status || "").toUpperCase() === "PAID")
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);

    const tableRevenue = tableOrders
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

    const cancellations =
      orders.filter(o => String(o.order_status || "").toUpperCase() === "CANCELLED").length +
      bookings.filter(b => String(b.status || "").toLowerCase() === "cancelled").length +
      tableOrders.filter(o => String(o.booking_status || "").toUpperCase() === "CANCELLED").length;

    // ── Pending actions ────────────────────────────────────────────────────────
    const newOrders =
      orders.filter(o => o.order_status === "NEW").length +
      tableOrders.filter(o => String(o.booking_status || "").toUpperCase() === "PLACED").length;
    const readyPickups = orders.filter(o => o.order_status === "READY_FOR_PICKUP").length;
    const pendingBookings = bookings.filter(b => isPendingBooking(b.status)).length;

    // ── Performance chart (last 7 days) ───────────────────────────────────────
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split("T")[0];
      const dayPickup = chartOrders.filter(o => o.created_at.startsWith(dayStr)).length;
      const dayTable = tableOrders.filter(o => o.created_at.startsWith(dayStr)).length;
      chartData.push({ day: dayStr, count: dayPickup + dayTable });
    }

    // ── Upcoming bookings (next 2 hours) ──────────────────────────────────────
    const upcomingBookings = todayBookings
      .map(b => {
        const dt = new Date(`${b.booking_date}T${String(b.booking_time || "00:00:00")}`);
        return { ...b, _dt: dt };
      })
      .filter(b => !isNaN(b._dt.getTime()) && b._dt >= now && b._dt <= plus2h)
      .sort((a, b) => a._dt - b._dt)
      .slice(0, 6)
      .map(({ _dt, ...b }) => b);

    // ── Live table orders (active only) ───────────────────────────────────────
    const liveTableOrders = allLiveTableOrders
      .filter(o => {
        const s = String(o.booking_status || "").toUpperCase();
        return s !== "COMPLETED" && s !== "PAID" && s !== "CANCELLED";
      })
      .slice(0, 8);

    return NextResponse.json({
      ok: true,
      kpis: {
        revenue: Math.round(pickupRevenue + tableRevenue),
        total_bookings: bookings.length,
        total_orders: orders.length + tableOrders.length,
        cancellations,
        rating: avgRating,
      },
      pending_actions: {
        new_orders: newOrders,
        ready_pickups: readyPickups,
        pending_bookings: pendingBookings,
      },
      chart_data: chartData,
      upcoming_bookings: upcomingBookings,
      pickup_orders: orders.slice(0, 6),
      table_orders: liveTableOrders,
      recent_reviews: reviews.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
