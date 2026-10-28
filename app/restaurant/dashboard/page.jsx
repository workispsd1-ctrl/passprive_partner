"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  ShoppingBag,
  Star,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { resolveActiveRestaurant } from "@/lib/restaurant-partner/activeRestaurant";

ChartJS.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);

const TZ = "Indian/Mauritius";
const DAY_MS = 86400000;
const REFRESH_MS = 60000;

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

const CHANNELS = [
  { key: "bill", label: "Pay bill", color: "#FF4800" },
  { key: "pickup", label: "Pickup", color: "#FDBA74" },
  { key: "dinein", label: "Dine-in QR", color: "#1F2937" },
];

const PAID_SESSION = ["FINALIZED", "VERIFIED_SUCCESS"];
const CANCELLED_BOOKING = ["cancelled", "canceled", "rejected", "declined"];
const PICKUP_DONE = ["PICKED_UP", "COMPLETED", "CANCELLED"];
const TABLE_DONE = ["COMPLETED", "PAID", "CANCELLED"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ymdInTz = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00+04:00`);
const addDays = (ymd, n) => ymdInTz(new Date(startOfDay(ymd).getTime() + n * DAY_MS + 12 * 3600000));
const hhmmInTz = (date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
const hourInTz = (date) => Number(hhmmInTz(date).slice(0, 2));
const mur = (n) => `MUR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const timeLabel = (value) => new Date(value).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const slotLabel = (time) => {
  const [h, m] = String(time || "").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h)) return "—";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dayLabel = (ymd) => startOfDay(ymd).toLocaleDateString("en-US", { timeZone: TZ, day: "numeric", month: "short" });
const isCancelled = (b) => CANCELLED_BOOKING.includes(String(b.status || "").toLowerCase());
const upper = (v) => String(v || "").toUpperCase();

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

function paidSales({ orders, tableOrders, sessions }) {
  return [
    ...sessions
      .filter((p) => PAID_SESSION.includes(upper(p.status)))
      .map((p) => ({ channel: "bill", at: p.created_at, amount: Number(p.amount_major || 0) })),
    ...orders
      .filter((o) => upper(o.payment_status) === "PAID")
      .map((o) => ({ channel: "pickup", at: o.created_at, amount: Number(o.total_amount || 0) })),
    ...tableOrders
      .filter((o) => ["PAID", "COMPLETED"].includes(upper(o.payment_status)) || upper(o.booking_status) === "PAID")
      .map((o) => ({ channel: "dinein", at: o.created_at, amount: Number(o.total_amount || 0) })),
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
  const bookings = data.bookings.filter((b) => b.booking_date >= from && b.booking_date <= to && !isCancelled(b));
  const paid = paidSales({ orders, tableOrders, sessions });
  const revenue = paid.reduce((s, x) => s + x.amount, 0);
  return {
    paid,
    revenue,
    orders: orders.length + tableOrders.length,
    avgTicket: paid.length ? revenue / paid.length : 0,
    covers: bookings.reduce((s, b) => s + Number(b.party_size || 0), 0),
  };
}

function delta(curr, prev) {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function openStatus(hours) {
  const now = new Date();
  const dow = WEEKDAYS.indexOf(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now));
  const row = hours.find((h) => Number(h.day_of_week) === dow);
  if (!row) return null;
  if (row.is_closed) return { open: false, text: "Closed today" };
  const nowHm = hhmmInTz(now);
  const open = String(row.open_time || "").slice(0, 5);
  const close = String(row.close_time || "").slice(0, 5);
  if (!open || !close) return null;
  const overnight = close <= open;
  const isOpen = overnight ? nowHm >= open || nowHm < close : nowHm >= open && nowHm < close;
  if (isOpen) return { open: true, text: `Open · closes ${slotLabel(close)}` };
  if (nowHm < open) return { open: false, text: `Closed · opens ${slotLabel(open)}` };
  return { open: false, text: "Closed for today" };
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
  const [reservationsView, setReservationsView] = useState("today");

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
      const weekAhead = addDays(today, 6);
      const createdFrom = bounds.prevFrom < today ? bounds.prevFrom : today;
      const fromIso = startOfDay(createdFrom).toISOString();
      const toIso = new Date(startOfDay(bounds.to > today ? bounds.to : today).getTime() + DAY_MS).toISOString();
      const bookingTo = bounds.to > weekAhead ? bounds.to : weekAhead;

      const [ordersRes, tableRes, sessionsRes, bookingsRes, reviewsRes, hoursRes] = await Promise.all([
        supabaseBrowser
          .from("restaurant_orders")
          .select("id,order_number,customer_name,total_amount,payment_status,order_status,pickup_code,created_at")
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
          .select("id,customer_name,booking_date,booking_time,party_size,status,proposed_at,special_request,created_at")
          .eq("restaurant_id", rid)
          .gte("booking_date", createdFrom)
          .lte("booking_date", bookingTo)
          .order("booking_time", { ascending: true })
          .limit(2000),
        supabaseBrowser
          .from("restaurant_reviews")
          .select("id,rating,review_text,username_snapshot,owner_reply_text,created_at")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseBrowser
          .from("restaurant_opening_hours")
          .select("day_of_week,open_time,close_time,is_closed")
          .eq("restaurant_id", rid),
      ]);

      const firstError = [ordersRes, tableRes, sessionsRes, bookingsRes, reviewsRes, hoursRes].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setData({
        today,
        orders: ordersRes.data || [],
        tableOrders: tableRes.data || [],
        sessions: sessionsRes.data || [],
        bookings: bookingsRes.data || [],
        reviews: reviewsRes.data || [],
        hours: hoursRes.data || [],
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
    const labels = hourly
      ? Array.from({ length: 24 }, (_, h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`)
      : Array.from({ length: bounds.days }, (_, i) => dayLabel(addDays(bounds.from, i)));
    const keys = hourly ? Array.from({ length: 24 }, (_, h) => h) : Array.from({ length: bounds.days }, (_, i) => addDays(bounds.from, i));
    const index = new Map(keys.map((k, i) => [k, i]));
    const series = Object.fromEntries(CHANNELS.map((c) => [c.key, new Array(keys.length).fill(0)]));
    const mix = Object.fromEntries(CHANNELS.map((c) => [c.key, 0]));
    curr.paid.forEach((s) => {
      const d = new Date(s.at);
      const i = index.get(hourly ? hourInTz(d) : ymdInTz(d));
      if (i === undefined) return;
      series[s.channel][i] += s.amount;
      mix[s.channel] += s.amount;
    });

    const ratings = data.reviews.map((r) => Number(r.rating)).filter(Number.isFinite);
    const rating = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;

    const isToday = (v) => ymdInTz(new Date(v)) === data.today;
    const weekAhead = addDays(data.today, 6);
    const reservations = data.bookings
      .filter((b) => b.booking_date >= data.today && b.booking_date <= weekAhead && !isCancelled(b))
      .sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`));
    const todayReservations = reservations.filter((b) => b.booking_date === data.today);

    const requests = reservations.filter((b) => String(b.status).toLowerCase() === "pending" && !b.proposed_at);
    const newPickups = data.orders.filter((o) => isToday(o.created_at) && upper(o.order_status) === "NEW");
    const readyPickups = data.orders.filter((o) => isToday(o.created_at) && upper(o.order_status) === "READY_FOR_PICKUP");
    const placedTables = data.tableOrders.filter((o) => isToday(o.created_at) && upper(o.booking_status) === "PLACED");
    const unanswered = data.reviews.filter(
      (r) => !String(r.owner_reply_text || "").trim() && Date.now() - new Date(r.created_at).getTime() < 14 * DAY_MS,
    );

    const actions = [
      ...requests.map((b) => ({ id: `b-${b.id}`, kind: "request", booking: b })),
      ...newPickups.map((o) => ({
        id: `p-${o.id}`,
        icon: ShoppingBag,
        title: `New pickup order ${o.order_number || ""}`.trim(),
        meta: `${o.customer_name || "Guest"} · ${mur(o.total_amount)} · ${timeLabel(o.created_at)}`,
        href: "/restaurant/orders",
        cta: "Open",
      })),
      ...placedTables.map((o) => ({
        id: `t-${o.id}`,
        icon: UtensilsCrossed,
        title: `Table ${o.table_no || "—"} placed an order`,
        meta: `${mur(o.total_amount)} · ${timeLabel(o.created_at)}`,
        href: "/restaurant/table-orders",
        cta: "Open",
      })),
      ...readyPickups.map((o) => ({
        id: `r-${o.id}`,
        icon: ShoppingBag,
        title: `Pickup ${o.order_number || ""} is ready`.trim(),
        meta: `${o.customer_name || "Guest"}${o.pickup_code ? ` · code ${o.pickup_code}` : ""}`,
        href: "/restaurant/orders",
        cta: "View",
      })),
      ...(unanswered.length
        ? [
            {
              id: "reviews",
              icon: MessageSquare,
              title: `${unanswered.length} review${unanswered.length === 1 ? "" : "s"} waiting for a reply`,
              meta: "Replying within a few days builds trust with guests",
              href: "/restaurant/reviews",
              cta: "Reply",
            },
          ]
        : []),
    ];

    const liveOrders = [
      ...data.orders
        .filter((o) => isToday(o.created_at) && !PICKUP_DONE.includes(upper(o.order_status)))
        .map((o) => ({ id: `p-${o.id}`, ref: o.order_number || "Pickup", type: "Pickup", customer: o.customer_name, at: o.created_at, amount: o.total_amount, status: o.order_status })),
      ...data.tableOrders
        .filter((o) => isToday(o.created_at) && !TABLE_DONE.includes(upper(o.booking_status)))
        .map((o) => ({ id: `t-${o.id}`, ref: `Table ${o.table_no || "—"}`, type: "Dine-in", customer: o.customer_name, at: o.created_at, amount: o.total_amount, status: o.booking_status })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    const completedToday =
      data.orders.filter((o) => isToday(o.created_at) && PICKUP_DONE.includes(upper(o.order_status))).length +
      data.tableOrders.filter((o) => isToday(o.created_at) && TABLE_DONE.includes(upper(o.booking_status))).length;

    return {
      curr,
      prev,
      labels,
      series,
      mix,
      rating,
      reviewCount: ratings.length,
      reservations,
      todayReservations,
      actions,
      liveOrders,
      completedToday,
      status: openStatus(data.hours),
      reviews: data.reviews.slice(0, 3),
    };
  }, [data, bounds]);

  if (!view) {
    return error ? <ErrorBanner message={error} /> : <DashboardSkeleton />;
  }

  const { curr, prev } = view;
  const compareLabel = range === "today" ? "vs yesterday" : range === "yesterday" ? "vs day before" : `vs prior ${bounds.days} days`;
  const reservationRows = reservationsView === "today" ? view.todayReservations : view.reservations;
  const mixTotal = CHANNELS.reduce((s, c) => s + view.mix[c.key], 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-gray-900">{restaurant?.name || "Dashboard"}</h1>
            {view.status ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  view.status.open ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${view.status.open ? "bg-green-500" : "bg-gray-400"}`} />
                {view.status.text}
              </span>
            ) : null}
            {restaurant?.is_active === false ? (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">Hidden from customers</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}
            {updatedAt ? ` · Updated ${timeLabel(updatedAt)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 lg:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {view.actions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="text-sm text-green-800">
            <span className="font-semibold">All caught up.</span> No requests, orders or reviews are waiting on you.
          </div>
        </div>
      ) : (
        <section className="rounded-2xl border border-orange-200 bg-white">
          <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              Needs your action
              <span className="rounded-full bg-[#FF4800] px-2 py-0.5 text-xs font-bold text-white">{view.actions.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {view.actions.slice(0, 8).map((a) =>
              a.kind === "request" ? (
                <div key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <IconTile icon={CalendarClock} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">
                      Booking request · {a.booking.customer_name || "Guest"}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {a.booking.booking_date === data.today ? "Today" : dayLabel(a.booking.booking_date)} · {slotLabel(a.booking.booking_time)} ·{" "}
                      {a.booking.party_size} guests
                      {a.booking.special_request ? ` · “${a.booking.special_request}”` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => respond(a.booking.id, "reject")}
                      disabled={busyBooking === a.booking.id}
                      className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(a.booking.id, "accept")}
                      disabled={busyBooking === a.booking.id}
                      className="h-8 rounded-lg bg-[#FF4800] px-3 text-xs font-semibold text-white hover:bg-[#E64000] disabled:opacity-60"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ) : (
                <Link key={a.id} href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                  <IconTile icon={a.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{a.title}</div>
                    <div className="truncate text-xs text-gray-500">{a.meta}</div>
                  </div>
                  <span className="inline-flex items-center text-sm font-semibold text-[#FF4800]">
                    {a.cta}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              ),
            )}
            {view.actions.length > 8 ? (
              <div className="px-5 py-2.5 text-xs text-gray-500">+{view.actions.length - 8} more</div>
            ) : null}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Performance</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
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
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 lg:grid-cols-5">
        <Metric className="col-span-2 lg:col-span-1" title="Net sales" value={mur(curr.revenue)} change={delta(curr.revenue, prev.revenue)} hint={compareLabel} />
        <Metric title="Orders" value={curr.orders} change={delta(curr.orders, prev.orders)} hint={compareLabel} />
        <Metric title="Avg. ticket" value={mur(curr.avgTicket)} change={delta(curr.avgTicket, prev.avgTicket)} hint={compareLabel} />
        <Metric title="Guests booked" value={curr.covers} change={delta(curr.covers, prev.covers)} hint={compareLabel} />
        <Metric title="Rating" value={view.rating ? view.rating.toFixed(1) : "—"} hint={`${view.reviewCount} reviews`} icon={Star} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Sales by channel</h2>
            <p className="text-xs text-gray-500">{bounds.days === 1 ? "By hour" : "By day"} · paid only</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <div key={c.key} className="text-xs">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
                  {c.label}
                </div>
                <div className="mt-0.5 font-semibold text-gray-900">
                  {mur(view.mix[c.key])}
                  <span className="ml-1 font-normal text-gray-400">
                    {mixTotal ? `${Math.round((view.mix[c.key] / mixTotal) * 100)}%` : "0%"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="h-60">
          <Bar
            data={{
              labels: view.labels,
              datasets: CHANNELS.map((c) => ({
                label: c.label,
                data: view.series[c.key],
                backgroundColor: c.color,
                borderRadius: 3,
                maxBarThickness: 26,
                stack: "sales",
              })),
            }}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${mur(c.parsed.y)}` } },
              },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: "#6B7280", maxRotation: 0, autoSkip: true } },
                y: {
                  stacked: true,
                  beginAtZero: true,
                  grid: { color: "#F3F4F6" },
                  ticks: { color: "#6B7280", callback: (v) => Number(v).toLocaleString("en-US") },
                },
              },
            }}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Reservations"
          subtitle={`Today: ${view.todayReservations.length} bookings · ${view.todayReservations.reduce((s, b) => s + Number(b.party_size || 0), 0)} guests`}
          href="/restaurant/bookings"
          tabs={[
            { key: "today", label: "Today" },
            { key: "week", label: "Next 7 days" },
          ]}
          tab={reservationsView}
          onTab={setReservationsView}
        >
          {reservationRows.length === 0 ? (
            <EmptyState text={reservationsView === "today" ? "No reservations today." : "No reservations in the next 7 days."} />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {reservationRows.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-20 shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{slotLabel(b.booking_time)}</div>
                    {reservationsView === "week" ? (
                      <div className="text-[11px] text-gray-500">{b.booking_date === data.today ? "Today" : dayLabel(b.booking_date)}</div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm text-gray-900">{b.customer_name || "Guest"}</div>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5" />
                    {b.party_size}
                  </span>
                  <BookingPill booking={b} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Live orders" subtitle={`${view.liveOrders.length} in progress · ${view.completedToday} completed today`} href="/restaurant/orders">
          {view.liveOrders.length === 0 ? (
            <EmptyState text="No orders in progress." />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {view.liveOrders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{o.ref}</div>
                    <div className="truncate text-xs text-gray-500">
                      {o.type} · {o.customer || "Guest"} · {timeLabel(o.at)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{mur(o.amount)}</div>
                  <OrderPill status={o.status} />
                </div>
              ))}
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
              <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">{r.username_snapshot || "Guest"}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gray-900">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {Number(r.rating || 0).toFixed(1)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                  {dayLabel(ymdInTz(new Date(r.created_at)))}
                  {String(r.owner_reply_text || "").trim() ? (
                    <span className="text-green-600">Replied</span>
                  ) : (
                    <Link href="/restaurant/reviews" className="font-semibold text-[#FF4800]">
                      Reply
                    </Link>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-gray-700">{r.review_text || "No written review"}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function IconTile({ icon: Icon }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50">
      <Icon className="h-4 w-4 text-[#FF4800]" />
    </span>
  );
}

function Panel({ title, subtitle, href, tabs, tab, onTab, className = "", children }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {tabs ? (
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTab(t.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          {href ? (
            <Link href={href} className="text-sm font-medium text-[#FF4800]">
              View all
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value, change, hint, icon: Icon, className = "" }) {
  const show = Number.isFinite(change) && Math.round(change) !== 0;
  const up = change > 0;
  return (
    <div className={`min-w-0 bg-white p-4 ${className}`}>
      <div className="text-xs font-medium text-gray-500">{title}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-2xl font-bold text-gray-900" title={String(value)}>
        {Icon ? <Icon className="h-5 w-5 fill-amber-400 text-amber-400" /> : null}
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {show ? (
          <span className={`inline-flex items-center font-semibold ${up ? "text-green-600" : "text-red-600"}`}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change).toFixed(0)}%
          </span>
        ) : null}
        <span className="truncate text-gray-400">{hint}</span>
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
  return <span className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function OrderPill({ status }) {
  const s = upper(status);
  const map = {
    NEW: ["New", "bg-blue-50 text-blue-700"],
    PLACED: ["Placed", "bg-blue-50 text-blue-700"],
    ACCEPTED: ["Accepted", "bg-blue-50 text-blue-700"],
    CONFIRMED: ["Confirmed", "bg-blue-50 text-blue-700"],
    PREPARING: ["Preparing", "bg-violet-50 text-violet-700"],
    READY_FOR_PICKUP: ["Ready", "bg-amber-50 text-amber-700"],
    SERVED: ["Served", "bg-emerald-50 text-emerald-700"],
  };
  const [label, cls] = map[s] || [s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "—", "bg-gray-100 text-gray-700"];
  return <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState({ text }) {
  return <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">{text}</div>;
}

function ErrorBanner({ message }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 w-72 rounded-xl bg-gray-200" />
      <div className="h-32 rounded-2xl border border-gray-200 bg-white" />
      <div className="h-24 rounded-2xl border border-gray-200 bg-white" />
      <div className="h-72 rounded-2xl border border-gray-200 bg-white" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-gray-200 bg-white" />
        <div className="h-72 rounded-2xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
