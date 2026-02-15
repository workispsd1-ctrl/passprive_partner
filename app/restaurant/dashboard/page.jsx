"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function RestaurantDashboardPage() {
  const router = useRouter();

  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [restaurantId, setRestaurantId] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviews, setReviews] = useState([]);

  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);

  const getRangeDates = () => {
    const now = new Date();

    if (range === "today") {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      const to = new Date(now);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }

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

    if (customFrom && customTo) {
      const from = new Date(`${customFrom}T00:00:00`);
      const to = new Date(`${customTo}T23:59:59`);
      return { from, to };
    }

    return null;
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user?.id) {
        setLoading(false);
        return;
      }

      const { data: restaurant, error: restErr } = await supabaseBrowser
        .from("restaurants")
        .select("id, rating, reviews")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (restErr) throw restErr;
      if (!restaurant?.id) {
        setError("No restaurant found for this account.");
        setLoading(false);
        return;
      }

      setRestaurantId(restaurant.id);
      setRating(Number(restaurant.rating || 0));
      setReviews(Array.isArray(restaurant.reviews) ? restaurant.reviews : []);

      const dates = getRangeDates();

      let ordersQuery = supabaseBrowser
        .from("restaurant_orders")
        .select(
          "id,order_number,customer_name,customer_phone,total_amount,payment_status,order_status,pickup_code,pickup_eta,created_at,items"
        )
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false })
        .limit(200);

      let bookingsQuery = supabaseBrowser
        .from("restaurant_bookings")
        .select(
          "id,customer_name,customer_phone,booking_date,booking_time,party_size,status,read,created_at,booking_code"
        )
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (dates) {
        ordersQuery = ordersQuery
          .gte("created_at", dates.from.toISOString())
          .lte("created_at", dates.to.toISOString());

        bookingsQuery = bookingsQuery
          .gte("created_at", dates.from.toISOString())
          .lte("created_at", dates.to.toISOString());
      }

      const [ordersRes, bookingsRes] = await Promise.all([ordersQuery, bookingsQuery]);

      if (ordersRes.error) throw ordersRes.error;
      if (bookingsRes.error) throw bookingsRes.error;

      setOrders(ordersRes.data || []);
      setBookings(bookingsRes.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (range === "custom" && customFrom && customTo) {
      loadDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFrom, customTo]);

  const kpis = useMemo(() => {
    const revenue = orders
      .filter((o) => o.payment_status === "PAID")
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    const totalBookings = bookings.length;
    const totalOrders = orders.length;

    const cancellations =
      orders.filter((o) => o.order_status === "CANCELLED").length +
      bookings.filter((b) => b.status === "cancelled").length;

    const newOrders = orders.filter((o) => o.order_status === "NEW").length;
    const readyPickups = orders.filter((o) => o.order_status === "READY_FOR_PICKUP").length;

    return {
      revenue,
      totalBookings,
      totalOrders,
      cancellations,
      rating: Number(rating || 0),
      newOrders,
      readyPickups,
    };
  }, [orders, bookings, rating]);

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    return bookings
      .map((b) => {
        const dt = new Date(`${b.booking_date}T${String(b.booking_time || "00:00:00")}`);
        return { ...b, bookingDateTime: dt };
      })
      .filter((b) => !Number.isNaN(b.bookingDateTime.getTime()))
      .filter((b) => b.bookingDateTime >= now && b.bookingDateTime <= plus2h)
      .sort((a, b) => a.bookingDateTime - b.bookingDateTime)
      .slice(0, 6);
  }, [bookings]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [orders]);

  const recentReviews = useMemo(() => {
    if (!Array.isArray(reviews)) return [];
    return [...reviews]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3);
  }, [reviews]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 outline-none"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 days</option>
            <option value="custom">Custom date</option>
          </select>

          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"
              />
              <span className="text-sm text-gray-500">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard title="Revenue" value={`₹ ${Number(kpis.revenue).toLocaleString("en-IN")}`} meta="Paid orders" />
        <KpiCard title="Bookings" value={String(kpis.totalBookings)} meta="In selected range" />
        <KpiCard title="Orders" value={String(kpis.totalOrders)} meta="Pickup orders" />
        <KpiCard title="Cancellations" value={String(kpis.cancellations)} meta="Bookings + orders" />
        <KpiCard title="Rating" value={kpis.rating.toFixed(1)} meta="Restaurant rating" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Performance</div>
              <div className="text-xs text-gray-500">
                {range === "today"
                  ? "Today"
                  : range === "yesterday"
                  ? "Yesterday"
                  : range === "week"
                  ? "Last 7 days"
                  : "Custom range"}
              </div>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 h-64 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="h-full flex items-end gap-2">
              {buildMiniBars(orders).map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-md"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i % 2 === 0 ? "var(--accent)" : "#94A3B8",
                    minHeight: "8px",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
              Orders trend
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              Relative volume
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Pending actions</div>
            <button
              type="button"
              onClick={() => router.push("/restaurant/orders")}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              View all
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <ActionCard
              title={`${kpis.newOrders} new orders`}
              subtitle="Accept quickly to reduce wait time"
              chip="Orders"
            />
            <ActionCard
              title={`${kpis.readyPickups} ready for pickup`}
              subtitle="Customer can collect now"
              chip="Pickup"
            />
            <ActionCard
              title={`${bookings.filter((b) => b.status === "pending").length} pending bookings`}
              subtitle="Confirm or decline reservation requests"
              chip="Bookings"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Next 2 hours bookings</div>
              <div className="text-xs text-gray-500">Quick view of upcoming reservations</div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/restaurant/bookings")}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Open bookings
            </button>
          </div>

          <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 overflow-hidden">
            {upcomingBookings.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No upcoming bookings in next 2 hours.</div>
            ) : (
              upcomingBookings.map((b) => (
                <TimelineRow
                  key={b.id}
                  time={toTime(b.bookingDateTime)}
                  name={b.customer_name || "Guest"}
                  guests={`${b.party_size || 0} guests`}
                  status={capitalize(b.status || "pending")}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Latest pickup orders</div>
            <button
              type="button"
              onClick={() => router.push("/restaurant/orders")}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              View all
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {recentOrders.length === 0 ? (
              <div className="text-sm text-gray-500">No recent orders.</div>
            ) : (
              recentOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  orderNo={o.order_number}
                  customer={o.customer_name}
                  total={Number(o.total_amount || 0)}
                  status={o.order_status}
                  pickupCode={o.pickup_code}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Recent reviews</div>
            <button
              type="button"
              onClick={() => router.push("/restaurant/reviews")}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              View all
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {recentReviews.length === 0 ? (
              <div className="text-sm text-gray-500">No recent reviews found.</div>
            ) : (
              recentReviews.map((r, idx) => (
                <ReviewCard
                  key={r.id || idx}
                  name={r.author_name || r.name || "Customer"}
                  rating={String(Number(r.rating || 0).toFixed(1))}
                  text={r.comment || r.text || "No comment"}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
   SMALL INTERNAL COMPONENTS
------------------------------ */

function KpiCard({ title, value, meta }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-2 text-xs text-gray-500">{meta}</div>
      <div className="mt-4 h-1.5 w-16 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
    </div>
  );
}

function ActionCard({ title, subtitle, chip }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold border"
          style={{
            borderColor: "rgba(197, 157, 95, 0.35)",
            backgroundColor: "rgba(197, 157, 95, 0.12)",
            color: "#8A6B2B",
          }}
        >
          {chip}
        </span>
      </div>
    </div>
  );
}

function TimelineRow({ time, name, guests, status }) {
  const isConfirmed = String(status).toLowerCase() === "confirmed";

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="w-20 text-sm font-semibold text-gray-900">{time}</div>

      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900">{name}</div>
        <div className="text-xs text-gray-600">{guests}</div>
      </div>

      <span
        className="rounded-full px-3 py-1 text-xs font-semibold border"
        style={{
          borderColor: isConfirmed ? "rgba(34,197,94,.25)" : "rgba(245,158,11,.25)",
          backgroundColor: isConfirmed ? "rgba(34,197,94,.10)" : "rgba(245,158,11,.10)",
          color: isConfirmed ? "#166534" : "#92400e",
        }}
      >
        {status}
      </span>
    </div>
  );
}

function ReviewCard({ name, rating, text }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{name}</div>
        <div
          className="text-xs font-semibold px-2 py-1 rounded-full border"
          style={{
            borderColor: "rgba(197, 157, 95, 0.35)",
            backgroundColor: "rgba(197, 157, 95, 0.12)",
            color: "#8A6B2B",
          }}
        >
          ★ {rating}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-700 leading-relaxed">{text}</div>
    </div>
  );
}

function OrderCard({ orderNo, customer, total, status, pickupCode }) {
  const st = String(status || "").toUpperCase();
  const tone =
    st === "NEW"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : st === "READY_FOR_PICKUP"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : st === "PICKED_UP"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : st === "CANCELLED"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">{orderNo || "Order"}</div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${tone}`}>{st}</span>
      </div>
      <div className="mt-1 text-xs text-gray-600">
        {customer || "Customer"} {pickupCode ? `• Code: ${pickupCode}` : ""}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">₹ {Number(total || 0).toLocaleString("en-IN")}</div>
    </div>
  );
}

/* -----------------------------
   HELPERS
------------------------------ */

function buildMiniBars(orders) {
  const days = new Array(7).fill(0);
  const now = new Date();

  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) return;
    const diff = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diff >= 0 && diff < 7) {
      const idx = 6 - diff;
      days[idx] += Number(o.total_amount || 0);
    }
  });

  const max = Math.max(...days, 1);
  return days.map((v) => Math.max(8, Math.round((v / max) * 100)));
}

function toTime(d) {
  if (!(d instanceof Date)) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function capitalize(v) {
  if (!v) return "";
  const s = String(v);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
