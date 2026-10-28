"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  Clock,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { resolveActiveRestaurant } from "@/lib/restaurant-partner/activeRestaurant";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const TZ = "Indian/Mauritius";
const ACCENT = "var(--theme-accent-solid)";
const DAY_MS = 86400000;
const REFRESH_MS = 60000;

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

const PAID_SESSION = ["FINALIZED", "VERIFIED_SUCCESS"];
const CANCELLED_BOOKING = ["cancelled", "canceled", "rejected", "declined"];

const ymdInTz = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00+04:00`);
const addDays = (ymd, n) => ymdInTz(new Date(startOfDay(ymd).getTime() + n * DAY_MS + 12 * 3600000));
const hourInTz = (date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(date));
const mur = (n) => `MUR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const timeLabel = (value) =>
  new Date(value).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const slotLabel = (time) => {
  const [h, m] = String(time || "").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h)) return "—";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dayLabel = (ymd) =>
  startOfDay(ymd).toLocaleDateString("en-US", { timeZone: TZ, day: "numeric", month: "short" });

function rangeBounds(range, customFrom, customTo) {
  const today = ymdInTz(new Date());
  let from = today;
  let to = today;
  if (range === "yesterday") from = to = addDays(today, -1);
  if (range === "7d") from = addDays(today, -6);
  if (range === "30d") from = addDays(today, -29);
  if (range === "custom" && customFrom && customTo) {
    from = customFrom <= customTo ? customFrom : customTo;
    to = customFrom <= customTo ? customTo : customFrom;
  }
  const days = Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS) + 1;
  return { from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

function sales({ orders, tableOrders, sessions }) {
  return [
    ...orders
      .filter((o) => String(o.payment_status || "").toUpperCase() === "PAID")
      .map((o) => ({ at: o.created_at, amount: Number(o.total_amount || 0) })),
    ...tableOrders
      .filter((o) => ["PAID", "COMPLETED"].includes(String(o.payment_status || "").toUpperCase()) || String(o.booking_status || "").toUpperCase() === "PAID")
      .map((o) => ({ at: o.created_at, amount: Number(o.total_amount || 0) })),
    ...sessions
      .filter((p) => PAID_SESSION.includes(String(p.status || "").toUpperCase()))
      .map((p) => ({ at: p.created_at, amount: Number(p.amount_major || 0) })),
  ];
}

function summarize(data, from, to) {
  const lo = startOfDay(from).getTime();
  const hi = startOfDay(to).getTime() + DAY_MS;
  const inRange = (v) => {
    const t = new Date(v).getTime();
    return t >= lo && t < hi;
  };
  const orders = data.orders.filter((o) => inRange(o.created_at));
  const tableOrders = data.tableOrders.filter((o) => inRange(o.created_at));
  const sessions = data.sessions.filter((p) => inRange(p.created_at));
  const bookings = data.bookings.filter(
    (b) => b.booking_date >= from && b.booking_date <= to && !CANCELLED_BOOKING.includes(String(b.status || "").toLowerCase()),
  );
  const paid = sales({ orders, tableOrders, sessions });
  const revenue = paid.reduce((s, x) => s + x.amount, 0);
  const orderCount = orders.length + tableOrders.length;
  return {
    paid,
    revenue,
    orders: orderCount,
    avgTicket: paid.length ? revenue / paid.length : 0,
    bookings: bookings.length,
    covers: bookings.reduce((s, b) => s + Number(b.party_size || 0), 0),
  };
}

function delta(curr, prev) {
  if (!prev) return curr ? null : 0;
  return ((curr - prev) / prev) * 100;
}

export default function RestaurantDashboardPage() {
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyBooking, setBusyBooking] = useState("");

  const bounds = useMemo(() => rangeBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const { active } = await resolveActiveRestaurant(supabaseBrowser);
      if (!active?.id) {
        setError("No restaurant found for this account.");
        return;
      }
      setRestaurant(active);
      const rid = active.id;
      const today = ymdInTz(new Date());
      const fromIso = startOfDay(bounds.prevFrom).toISOString();
      const toIso = new Date(startOfDay(bounds.to).getTime() + DAY_MS).toISOString();
      const bookingFrom = bounds.prevFrom < today ? bounds.prevFrom : today;
      const bookingTo = bounds.to > today ? bounds.to : today;

      const [ordersRes, tableRes, sessionsRes, bookingsRes, requestsRes, reviewsRes] = await Promise.all([
        supabaseBrowser
          .from("restaurant_orders")
          .select("id,order_number,customer_name,total_amount,payment_status,order_status,created_at")
          .eq("restaurant_id", rid)
          .gte("created_at", fromIso)
          .lt("created_at", toIso)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabaseBrowser
          .from("restaurant_table_bookings")
          .select("id,customer_name,total_amount,payment_status,booking_status,table_no,created_at")
          .eq("restaurant_id", rid)
          .gte("created_at", fromIso)
          .lt("created_at", toIso)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabaseBrowser
          .from("payment_sessions")
          .select("id,amount_major,status,created_at")
          .eq("restaurant_id", rid)
          .eq("payment_context", "BILL_PAYMENT")
          .gte("created_at", fromIso)
          .lt("created_at", toIso)
          .limit(2000),
        supabaseBrowser
          .from("restaurant_bookings")
          .select("id,customer_name,customer_phone,booking_date,booking_time,party_size,status,proposed_at,proposed_date,proposed_time,special_request")
          .eq("restaurant_id", rid)
          .gte("booking_date", bookingFrom)
          .lte("booking_date", bookingTo)
          .order("booking_time", { ascending: true })
          .limit(2000),
        supabaseBrowser
          .from("restaurant_bookings")
          .select("id,customer_name,booking_date,booking_time,party_size,special_request,created_at")
          .eq("restaurant_id", rid)
          .eq("status", "pending")
          .is("proposed_at", null)
          .gte("booking_date", today)
          .order("created_at", { ascending: true })
          .limit(10),
        supabaseBrowser
          .from("restaurant_reviews")
          .select("id,rating,comment,created_at")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const firstError = [ordersRes, tableRes, sessionsRes, bookingsRes, requestsRes, reviewsRes].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setData({
        today,
        orders: ordersRes.data || [],
        tableOrders: tableRes.data || [],
        sessions: sessionsRes.data || [],
        bookings: bookingsRes.data || [],
        requests: requestsRes.data || [],
        reviews: reviewsRes.data || [],
      });
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setRefreshing(false);
    }
  }, [bounds]);

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return undefined;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, range, customFrom, customTo]);

  const respond = async (bookingId, action) => {
    setBusyBooking(bookingId);
    const { data: res, error: rpcError } = await supabaseBrowser.rpc("partner_respond_booking", {
      p_booking_id: bookingId,
      p_action: action,
      p_reason: action === "reject" ? "Rejected by restaurant" : null,
    });
    setBusyBooking("");
    if (rpcError || !res?.ok) {
      setError(
        res?.error === "payment_pending"
          ? "The guest has not paid the cover charge yet."
          : res?.error === "booking_paid"
          ? "This booking is already paid and can't be rejected here."
          : rpcError?.message || "Could not update the booking.",
      );
    }
    load();
  };

  const view = useMemo(() => {
    if (!data) return null;
    const curr = summarize(data, bounds.from, bounds.to);
    const prev = summarize(data, bounds.prevFrom, bounds.prevTo);

    const hourly = bounds.days === 1;
    const buckets = hourly
      ? Array.from({ length: 24 }, (_, h) => ({ key: h, label: `${h % 12 || 12}${h < 12 ? "a" : "p"}`, value: 0 }))
      : Array.from({ length: bounds.days }, (_, i) => {
          const ymd = addDays(bounds.from, i);
          return { key: ymd, label: dayLabel(ymd), value: 0 };
        });
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    curr.paid.forEach((s) => {
      const d = new Date(s.at);
      const i = index.get(hourly ? hourInTz(d) : ymdInTz(d));
      if (i !== undefined) buckets[i].value += s.amount;
    });

    const ratings = data.reviews.map((r) => Number(r.rating)).filter(Number.isFinite);
    const rating = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;

    const todays = data.bookings
      .filter((b) => b.booking_date === data.today && !CANCELLED_BOOKING.includes(String(b.status || "").toLowerCase()))
      .sort((a, b) => String(a.booking_time).localeCompare(String(b.booking_time)));

    const recent = [
      ...data.orders.map((o) => ({
        id: `p-${o.id}`,
        ref: o.order_number || "Pickup",
        type: "Pickup",
        customer: o.customer_name,
        at: o.created_at,
        amount: o.total_amount,
        status: o.order_status,
      })),
      ...data.tableOrders.map((o) => ({
        id: `t-${o.id}`,
        ref: `Table ${o.table_no || "—"}`,
        type: "Dine-in",
        customer: o.customer_name,
        at: o.created_at,
        amount: o.total_amount,
        status: o.booking_status,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);

    const isToday = (v) => ymdInTz(new Date(v)) === data.today;
    const attention = [
      {
        label: "New pickup orders",
        count: data.orders.filter((o) => isToday(o.created_at) && o.order_status === "NEW").length,
        href: "/restaurant/orders",
      },
      {
        label: "Ready for pickup",
        count: data.orders.filter((o) => isToday(o.created_at) && o.order_status === "READY_FOR_PICKUP").length,
        href: "/restaurant/orders",
      },
      {
        label: "Active table orders",
        count: data.tableOrders.filter(
          (o) => isToday(o.created_at) && !["COMPLETED", "PAID", "CANCELLED"].includes(String(o.booking_status || "").toUpperCase()),
        ).length,
        href: "/restaurant/table-orders",
      },
      {
        label: "Waiting for guest to confirm new time",
        count: data.bookings.filter((b) => String(b.status).toLowerCase() === "pending" && b.proposed_at).length,
        href: "/restaurant/bookings",
      },
    ].filter((a) => a.count > 0);

    return {
      curr,
      prev,
      buckets,
      rating,
      reviewCount: ratings.length,
      todays,
      recent,
      attention,
      reviews: data.reviews.slice(0, 3),
    };
  }, [data, bounds]);

  if (!view) {
    return error ? <ErrorBanner message={error} /> : <DashboardSkeleton />;
  }

  const { curr, prev } = view;
  const compareLabel = range === "today" ? "vs yesterday" : range === "yesterday" ? "vs day before" : `vs previous ${bounds.days} days`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greeting()}, {restaurant?.name || "there"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}
            {updatedAt ? ` · Updated ${timeLabel(updatedAt)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  range === r.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              />
              <span className="text-sm text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            aria-label="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard className="col-span-2 lg:col-span-1" icon={Wallet} title="Revenue" value={mur(curr.revenue)} change={delta(curr.revenue, prev.revenue)} hint={compareLabel} />
        <KpiCard icon={ShoppingBag} title="Orders" value={curr.orders} change={delta(curr.orders, prev.orders)} hint={compareLabel} />
        <KpiCard icon={ReceiptText} title="Avg. ticket" value={mur(curr.avgTicket)} change={delta(curr.avgTicket, prev.avgTicket)} hint={compareLabel} />
        <KpiCard icon={CalendarCheck} title="Reservations" value={curr.bookings} change={delta(curr.bookings, prev.bookings)} hint={`${curr.covers} guests`} />
        <KpiCard icon={Star} title="Rating" value={view.rating ? view.rating.toFixed(1) : "—"} hint={`${view.reviewCount} reviews`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Sales"
          subtitle={`${bounds.days === 1 ? "By hour" : "By day"} · pickup, dine-in and pay-bill`}
        >
          <div className="h-64">
            <Bar
              data={{
                labels: view.buckets.map((b) => b.label),
                datasets: [{ data: view.buckets.map((b) => b.value), backgroundColor: "#FF4800", borderRadius: 6, maxBarThickness: 28 }],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => mur(c.parsed.y) } } },
                scales: {
                  x: { grid: { display: false }, ticks: { color: "#6B7280", maxRotation: 0, autoSkip: true } },
                  y: { beginAtZero: true, grid: { color: "#F3F4F6" }, ticks: { color: "#6B7280", callback: (v) => Number(v).toLocaleString("en-US") } },
                },
              }}
            />
          </div>
        </Panel>

        <Panel title="Needs attention">
          {data.requests.length === 0 && view.attention.length === 0 ? (
            <EmptyState text="You're all caught up." />
          ) : (
            <div className="space-y-3">
              {data.requests.map((b) => (
                <div key={b.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{b.customer_name || "Guest"}</div>
                      <div className="text-xs text-gray-600">
                        {dayLabel(b.booking_date)} · {slotLabel(b.booking_time)} · {b.party_size} guests
                      </div>
                      {b.special_request ? <div className="mt-1 truncate text-xs text-gray-500">“{b.special_request}”</div> : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Request</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => respond(b.id, "reject")}
                      disabled={busyBooking === b.id}
                      className="h-8 flex-1 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(b.id, "accept")}
                      disabled={busyBooking === b.id}
                      className="h-8 flex-1 rounded-lg bg-green-600 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
              {view.attention.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-700">{a.label}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                    {a.count}
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Today's reservations" subtitle={`${view.todays.length} bookings · ${view.todays.reduce((s, b) => s + Number(b.party_size || 0), 0)} guests`} href="/restaurant/bookings">
          {view.todays.length === 0 ? (
            <EmptyState text="No reservations today." />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {view.todays.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-16 shrink-0 text-sm font-semibold text-gray-900">{slotLabel(b.booking_time)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-gray-900">{b.customer_name || "Guest"}</div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="h-3 w-3" /> {b.party_size}
                    </div>
                  </div>
                  <BookingPill booking={b} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Recent orders" href="/restaurant/orders">
          {view.recent.length === 0 ? (
            <EmptyState text="No orders in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 pl-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {view.recent.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5">
                        <div className="font-medium text-gray-900">{o.ref}</div>
                        <div className="text-xs text-gray-500">{o.type}</div>
                      </td>
                      <td className="py-2.5 text-gray-700">{o.customer || "Guest"}</td>
                      <td className="py-2.5 text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeLabel(o.at)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">{mur(o.amount)}</td>
                      <td className="py-2.5 pl-4">
                        <OrderPill status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Latest reviews" href="/restaurant/reviews">
        {view.reviews.length === 0 ? (
          <EmptyState text="No reviews yet." />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {view.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {Number(r.rating || 0).toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">{dayLabel(ymdInTz(new Date(r.created_at)))}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-gray-700">{r.comment || "No comment"}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function greeting() {
  const h = hourInTz(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Panel({ title, subtitle, href, className = "", children }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-medium" style={{ color: ACCENT }}>
            View all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function KpiCard({ icon: Icon, title, value, change, hint, className = "" }) {
  const up = change > 0;
  const showChange = change !== undefined && change !== null && Number.isFinite(change) && change !== 0;
  return (
    <div className={`min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
          <Icon className="h-4 w-4" style={{ color: ACCENT }} />
        </span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold text-gray-900" title={String(value)}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {showChange ? (
          <span className={`inline-flex items-center font-semibold ${up ? "text-green-600" : "text-red-600"}`}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change).toFixed(0)}%
          </span>
        ) : null}
        <span className="truncate text-gray-500">{hint}</span>
      </div>
    </div>
  );
}

function BookingPill({ booking }) {
  const s = String(booking.status || "").toLowerCase();
  const [label, cls] =
    s === "pending" && booking.proposed_at
      ? ["New time sent", "bg-orange-50 text-orange-700"]
      : s === "pending"
      ? ["Request", "bg-amber-50 text-amber-700"]
      : ["Confirmed", "bg-green-50 text-green-700"];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function OrderPill({ status }) {
  const s = String(status || "").toUpperCase();
  const map = {
    NEW: ["New", "bg-blue-50 text-blue-700"],
    PLACED: ["Placed", "bg-blue-50 text-blue-700"],
    CONFIRMED: ["Confirmed", "bg-blue-50 text-blue-700"],
    PREPARING: ["Preparing", "bg-violet-50 text-violet-700"],
    READY_FOR_PICKUP: ["Ready", "bg-amber-50 text-amber-700"],
    SERVED: ["Served", "bg-emerald-50 text-emerald-700"],
    PICKED_UP: ["Picked up", "bg-green-50 text-green-700"],
    COMPLETED: ["Completed", "bg-green-50 text-green-700"],
    PAID: ["Paid", "bg-green-50 text-green-700"],
    CANCELLED: ["Cancelled", "bg-red-50 text-red-700"],
  };
  const [label, cls] = map[s] || [s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "—", "bg-gray-100 text-gray-700"];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState({ text }) {
  return <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{text}</div>;
}

function ErrorBanner({ message }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-12 w-72 rounded-xl bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-2xl border border-gray-200 bg-white lg:col-span-2" />
        <div className="h-80 rounded-2xl border border-gray-200 bg-white" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-2xl border border-gray-200 bg-white" />
        <div className="h-72 rounded-2xl border border-gray-200 bg-white lg:col-span-2" />
      </div>
    </div>
  );
}
