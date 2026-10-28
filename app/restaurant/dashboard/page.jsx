"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  QrCode,
  ReceiptText,
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
import { useI18n } from "@/lib/i18n";
import { money, paymentTypeKey } from "@/components/restaurant-dashboard/PaymentAlertNotifier";

ChartJS.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);

const TZ = "Indian/Mauritius";
const DAY_MS = 86400000;
const REFRESH_MS = 60000;

const RANGES = ["today", "yesterday", "7d", "30d", "custom"];

const CHANNELS = [
  { key: "bill", color: "#FF4800" },
  { key: "pickup", color: "#FDBA74" },
  { key: "dinein", color: "#1F2937" },
];

const PAYMENT_TYPES = [
  { key: "bill", icon: ReceiptText },
  { key: "order", icon: ShoppingBag },
  { key: "table", icon: QrCode },
];

const PAID_SESSION = ["FINALIZED", "VERIFIED_SUCCESS"];
const CANCELLED_BOOKING = ["cancelled", "canceled", "rejected", "declined"];
const PICKUP_DONE = ["PICKED_UP", "COMPLETED", "CANCELLED"];
const TABLE_DONE = ["COMPLETED", "PAID", "CANCELLED"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PICKUP_NEXT = {
  NEW: ["ACCEPTED", "dash.next.accept"],
  ACCEPTED: ["PREPARING", "dash.next.start"],
  PREPARING: ["READY_FOR_PICKUP", "dash.next.ready"],
  READY_FOR_PICKUP: ["PICKED_UP", "dash.next.collected"],
};
const PICKUP_STAMP = { ACCEPTED: "accepted_at", READY_FOR_PICKUP: "ready_at", PICKED_UP: "picked_up_at" };

const ymdInTz = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00+04:00`);
const addDays = (ymd, n) => ymdInTz(new Date(startOfDay(ymd).getTime() + n * DAY_MS + 12 * 3600000));
const hhmmInTz = (date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
const hourInTz = (date) => Number(hhmmInTz(date).slice(0, 2));
const mur = (n) => `MUR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
      .filter((p) => PAID_SESSION.includes(upper(p.status)) && !p.order_payload)
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
  if (row.is_closed) return { open: false, key: "dash.open.closedToday" };
  const nowHm = hhmmInTz(now);
  const open = String(row.open_time || "").slice(0, 5);
  const close = String(row.close_time || "").slice(0, 5);
  if (!open || !close) return null;
  const overnight = close <= open;
  const isOpen = overnight ? nowHm >= open || nowHm < close : nowHm >= open && nowHm < close;
  if (isOpen) return { open: true, key: "dash.open.openUntil", time: close };
  if (nowHm < open) return { open: false, key: "dash.open.opensAt", time: open };
  return { open: false, key: "dash.open.closedForDay" };
}

export default function RestaurantDashboardPage() {
  const { t, fmt } = useI18n();
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyBooking, setBusyBooking] = useState("");
  const [reservationsView, setReservationsView] = useState("today");
  const [busyOrder, setBusyOrder] = useState("");

  const bounds = useMemo(() => rangeBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { active } = await resolveActiveRestaurant(supabaseBrowser);
      if (!active?.id) {
        setError({ key: "dash.noRestaurant" });
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

      const [ordersRes, tableRes, sessionsRes, bookingsRes, reviewsRes, hoursRes, recentPaymentsRes, todayPaymentsRes] = await Promise.all([
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
          .select("id,amount_major,status,created_at,order_payload:gateway_payload->order_payload")
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
        supabaseBrowser.rpc("partner_recent_payments", { p_restaurant_id: rid, p_since: null, p_limit: 6 }),
        supabaseBrowser.rpc("partner_recent_payments", { p_restaurant_id: rid, p_since: startOfDay(today).toISOString(), p_limit: 200 }),
      ]);

      const firstError = [ordersRes, tableRes, sessionsRes, bookingsRes, reviewsRes, hoursRes, recentPaymentsRes, todayPaymentsRes].find(
        (r) => r.error,
      )?.error;
      if (firstError) throw firstError;

      setData({
        today,
        orders: ordersRes.data || [],
        tableOrders: tableRes.data || [],
        sessions: sessionsRes.data || [],
        bookings: bookingsRes.data || [],
        reviews: reviewsRes.data || [],
        hours: hoursRes.data || [],
        recentPayments: recentPaymentsRes.data || [],
        todayPayments: todayPaymentsRes.data || [],
      });
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e?.message ? { text: e.message } : { key: "dash.loadFailed" });
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
        res?.error === "payment_pending" || res?.error === "booking_paid"
          ? { key: `dash.err.${res.error}` }
          : rpcError?.message
          ? { text: rpcError.message }
          : { key: "dash.err.booking" },
      );
    }
    load();
  };

  const advancePickup = async (order) => {
    const next = PICKUP_NEXT[upper(order.order_status)];
    if (!next) return;
    setBusyOrder(order.id);
    const patch = { order_status: next[0] };
    if (PICKUP_STAMP[next[0]]) patch[PICKUP_STAMP[next[0]]] = new Date().toISOString();
    const { error: updateError } = await supabaseBrowser.from("restaurant_orders").update(patch).eq("id", order.id);
    setBusyOrder("");
    if (updateError) setError(updateError.message ? { text: updateError.message } : { key: "dash.err.order" });
    load();
  };

  const view = useMemo(() => {
    if (!data) return null;
    const curr = summarize(data, bounds.from, bounds.to);
    const prev = summarize(data, bounds.prevFrom, bounds.prevTo);

    const hourly = bounds.days === 1;
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
      ...newPickups.map((o) => ({ id: `p-${o.id}`, kind: "pickupNew", order: o, icon: ShoppingBag, href: "/restaurant/orders", cta: "dash.action.open" })),
      ...placedTables.map((o) => ({ id: `t-${o.id}`, kind: "table", order: o, icon: UtensilsCrossed, href: "/restaurant/table-orders", cta: "dash.action.open" })),
      ...readyPickups.map((o) => ({ id: `r-${o.id}`, kind: "pickupReady", order: o, icon: ShoppingBag, href: "/restaurant/orders", cta: "dash.action.view" })),
      ...(unanswered.length
        ? [{ id: "reviews", kind: "reviews", count: unanswered.length, icon: MessageSquare, href: "/restaurant/reviews", cta: "dash.action.reply" }]
        : []),
    ];

    const todayPickups = data.orders.filter((o) => isToday(o.created_at));
    const pickupQueue = todayPickups
      .filter((o) => !PICKUP_DONE.includes(upper(o.order_status)))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const pickupCounts = {
      new: todayPickups.filter((o) => upper(o.order_status) === "NEW").length,
      preparing: todayPickups.filter((o) => ["ACCEPTED", "PREPARING"].includes(upper(o.order_status))).length,
      ready: todayPickups.filter((o) => upper(o.order_status) === "READY_FOR_PICKUP").length,
      collected: todayPickups.filter((o) => ["PICKED_UP", "COMPLETED"].includes(upper(o.order_status))).length,
    };

    const tableQueue = data.tableOrders
      .filter((o) => isToday(o.created_at) && !TABLE_DONE.includes(upper(o.booking_status)))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const tablesDone = data.tableOrders.filter((o) => isToday(o.created_at) && TABLE_DONE.includes(upper(o.booking_status))).length;

    return {
      curr,
      prev,
      hourly,
      keys,
      series,
      mix,
      rating,
      reviewCount: ratings.length,
      reservations,
      todayReservations,
      actions,
      pickupQueue,
      pickupCounts,
      tableQueue,
      tablesDone,
      status: openStatus(data.hours),
      reviews: data.reviews.slice(0, 3),
    };
  }, [data, bounds]);

  if (!view) {
    return error ? <ErrorBanner message={error.key ? t(error.key) : error.text} /> : <DashboardSkeleton />;
  }

  const { curr, prev } = view;
  const compareLabel =
    range === "today" ? t("dash.compare.today") : range === "yesterday" ? t("dash.compare.yesterday") : t("dash.compare.days", { count: bounds.days });
  const paymentsToday = data.todayPayments.reduce(
    (acc, p) => {
      const amount = Number(p.amount || 0);
      const key = paymentTypeKey(p).split(".").pop();
      acc.total += amount;
      acc.count += 1;
      acc.byType[key] = (acc.byType[key] || 0) + amount;
      return acc;
    },
    { total: 0, count: 0, byType: {} },
  );
  const paymentGroups = data.recentPayments.reduce((groups, p) => {
    const day = ymdInTz(new Date(p.paid_at));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(p);
    else groups.push({ day, rows: [p] });
    return groups;
  }, []);
  const chartLabels = view.hourly ? view.keys.map((h) => fmt.hour(h)) : view.keys.map((ymd) => fmt.day(ymd));
  const actionText = (a) => {
    if (a.kind === "pickupNew") {
      return {
        title: t("dash.action.newPickup", { number: a.order.order_number || "" }).trim(),
        meta: `${a.order.customer_name || t("common.guest")} · ${mur(a.order.total_amount)} · ${fmt.time(a.order.created_at)}`,
      };
    }
    if (a.kind === "table") {
      return {
        title: t("dash.action.tableOrder", { table: a.order.table_no || "—" }),
        meta: `${mur(a.order.total_amount)} · ${fmt.time(a.order.created_at)}`,
      };
    }
    if (a.kind === "pickupReady") {
      return {
        title: t("dash.action.pickupReady", { number: a.order.order_number || "" }).replace(/\s+/g, " ").trim(),
        meta: `${a.order.customer_name || t("common.guest")}${a.order.pickup_code ? ` · ${t("common.code", { code: a.order.pickup_code })}` : ""}`,
      };
    }
    return { title: t("dash.action.reviews", { count: a.count }), meta: t("dash.action.reviewsHint") };
  };
  const reservationRows = reservationsView === "today" ? view.todayReservations : view.reservations;
  const mixTotal = CHANNELS.reduce((s, c) => s + view.mix[c.key], 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-gray-900">{restaurant?.name || t("nav.dashboard")}</h1>
            {view.status ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  view.status.open ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${view.status.open ? "bg-green-500" : "bg-gray-400"}`} />
                {t(view.status.key, { time: view.status.time ? fmt.slot(view.status.time) : "" })}
              </span>
            ) : null}
            {restaurant?.is_active === false ? (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{t("dash.hidden")}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            <span className="inline-block first-letter:uppercase">{fmt.longDate(new Date())}</span>
            {updatedAt ? ` · ${t("dash.updated", { time: fmt.time(updatedAt) })}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 lg:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {t("dash.refresh")}
        </button>
      </div>

      {error ? <ErrorBanner message={error.key ? t(error.key) : error.text} /> : null}

      {view.actions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="text-sm text-green-800">
            <span className="font-semibold">{t("dash.allCaughtUp")}</span> {t("dash.allCaughtUpHint")}
          </div>
        </div>
      ) : (
        <section className="rounded-2xl border border-orange-200 bg-white">
          <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              {t("dash.needsAction")}
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
                      {t("dash.action.bookingRequest", { name: a.booking.customer_name || t("common.guest") })}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {a.booking.booking_date === data.today ? t("common.today") : fmt.day(a.booking.booking_date)} · {fmt.slot(a.booking.booking_time)} ·{" "}
                      {t("common.guests", { count: Number(a.booking.party_size || 0) })}
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
                      {t("common.reject")}
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(a.booking.id, "accept")}
                      disabled={busyBooking === a.booking.id}
                      className="h-8 rounded-lg bg-[#FF4800] px-3 text-xs font-semibold text-white hover:bg-[#E64000] disabled:opacity-60"
                    >
                      {t("common.accept")}
                    </button>
                  </div>
                </div>
              ) : (
                <Link key={a.id} href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                  <IconTile icon={a.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{actionText(a).title}</div>
                    <div className="truncate text-xs text-gray-500">{actionText(a).meta}</div>
                  </div>
                  <span className="inline-flex shrink-0 items-center text-sm font-semibold text-[#FF4800]">
                    {t(a.cta)}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              ),
            )}
            {view.actions.length > 8 ? (
              <div className="px-5 py-2.5 text-xs text-gray-500">{t("dash.more", { count: view.actions.length - 8 })}</div>
            ) : null}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("dash.performance")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  range === key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t(`dash.range.${key}`)}
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
              <span className="text-xs text-gray-400">{t("dash.range.to")}</span>
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
        <Metric className="col-span-2 lg:col-span-1" title={t("dash.metric.netSales")} value={mur(curr.revenue)} change={delta(curr.revenue, prev.revenue)} hint={compareLabel} />
        <Metric title={t("dash.metric.orders")} value={curr.orders} change={delta(curr.orders, prev.orders)} hint={compareLabel} />
        <Metric title={t("dash.metric.avgTicket")} value={mur(curr.avgTicket)} change={delta(curr.avgTicket, prev.avgTicket)} hint={compareLabel} />
        <Metric title={t("dash.metric.guestsBooked")} value={curr.covers} change={delta(curr.covers, prev.covers)} hint={compareLabel} />
        <Metric title={t("dash.metric.rating")} value={view.rating ? view.rating.toFixed(1) : "—"} hint={t("dash.metric.reviews", { count: view.reviewCount })} icon={Star} />
      </div>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{t("payments.title")}</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">{t("common.today")}</span>
          </div>
          <div className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{money(paymentsToday.total)}</div>
          <div className="mt-1 text-sm text-gray-500">
            {t("payments.count", { count: paymentsToday.count })}
            {paymentsToday.count ? ` · ${t("payments.average", { amount: money(paymentsToday.total / paymentsToday.count) })}` : ""}
          </div>
          <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
            {PAYMENT_TYPES.map((type) => {
              const value = paymentsToday.byType[type.key] || 0;
              const share = paymentsToday.total ? (value / paymentsToday.total) * 100 : 0;
              return (
                <div key={type.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-gray-600">
                      <type.icon className="h-4 w-4 text-gray-400" />
                      {t(`payments.type.${type.key}`)}
                    </span>
                    <span className="font-semibold text-gray-900">{money(value)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-[#FF4800]" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-semibold text-gray-900">{t("payments.recent")}</h2>
            <Link href="/restaurant/transactions" className="whitespace-nowrap text-sm font-medium text-[#FF4800]">
              {t("common.viewAll")}
            </Link>
          </div>
          {data.recentPayments.length === 0 ? (
            <div className="p-5">
              <EmptyState text={t("payments.empty")} />
            </div>
          ) : (
            <div className="mt-2 pb-2">
              {paymentGroups.map((group) => (
                <div key={group.day}>
                  <div className="bg-gray-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {group.day === data.today ? t("common.today") : group.day === addDays(data.today, -1) ? t("dash.range.yesterday") : fmt.day(group.day)}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {group.rows.map((p) => {
                      const type = PAYMENT_TYPES.find((x) => `payments.type.${x.key}` === paymentTypeKey(p)) || PAYMENT_TYPES[0];
                      const discounted = Number(p.bill_amount) > Number(p.amount);
                      return (
                        <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50">
                            <type.icon className="h-4 w-4 text-[#FF4800]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-gray-900">{p.customer || t("common.customer")}</div>
                            <div className="truncate text-xs text-gray-500" title={p.reference || ""}>
                              {t(paymentTypeKey(p))} · {fmt.time(p.paid_at)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-bold text-gray-900">{money(p.amount, p.currency)}</div>
                            <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px]">
                              {discounted ? (
                                <span className="text-gray-400">{t("payments.ofBill", { amount: money(p.bill_amount, p.currency) })}</span>
                              ) : null}
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
                                <CircleCheck className="h-3 w-3" />
                                {t("payments.status.paid")}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel
          title={t("dash.reservations")}
          subtitle={t("dash.reservationsToday", {
            bookings: t("common.bookings", { count: view.todayReservations.length }),
            guests: t("common.guests", { count: view.todayReservations.reduce((s, b) => s + Number(b.party_size || 0), 0) }),
          })}
          href="/restaurant/bookings"
          tabs={[
            { key: "today", label: t("dash.tab.today") },
            { key: "week", label: t("dash.tab.week") },
          ]}
          tab={reservationsView}
          onTab={setReservationsView}
        >
          {reservationRows.length === 0 ? (
            <EmptyState text={reservationsView === "today" ? t("dash.emptyToday") : t("dash.emptyWeek")} />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {reservationRows.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-20 shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{fmt.slot(b.booking_time)}</div>
                    {reservationsView === "week" ? (
                      <div className="text-[11px] text-gray-500">{b.booking_date === data.today ? t("common.today") : fmt.day(b.booking_date)}</div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm text-gray-900">{b.customer_name || t("common.guest")}</div>
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

        <Panel
          title={t("dash.pickup")}
          subtitle={t("dash.pickupSubtitle", { active: view.pickupQueue.length, done: view.pickupCounts.collected })}
          href="/restaurant/orders"
        >
          <div className="mb-3 grid grid-cols-4 gap-2">
            {[
              [t("dash.count.new"), view.pickupCounts.new, "text-blue-700 bg-blue-50"],
              [t("dash.count.preparing"), view.pickupCounts.preparing, "text-violet-700 bg-violet-50"],
              [t("dash.count.ready"), view.pickupCounts.ready, "text-amber-700 bg-amber-50"],
              [t("dash.count.collected"), view.pickupCounts.collected, "text-green-700 bg-green-50"],
            ].map(([label, count, cls]) => (
              <div key={label} className={`rounded-lg px-2 py-1.5 text-center ${cls}`}>
                <div className="text-lg font-bold leading-tight">{count}</div>
                <div className="truncate text-[11px] font-medium">{label}</div>
              </div>
            ))}
          </div>
          {view.pickupQueue.length === 0 ? (
            <EmptyState text={t("dash.emptyPickup")} />
          ) : (
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
              {view.pickupQueue.map((o) => {
                const next = PICKUP_NEXT[upper(o.order_status)];
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">{o.order_number || t("common.order")}</span>
                        <OrderPill status={o.order_status} />
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {o.customer_name || t("common.guest")} · {fmt.time(o.created_at)} · {mur(o.total_amount)}
                        {o.pickup_code ? ` · ${t("common.code", { code: o.pickup_code })}` : ""}
                      </div>
                    </div>
                    {next ? (
                      <button
                        type="button"
                        onClick={() => advancePickup(o)}
                        disabled={busyOrder === o.id}
                        className="h-8 shrink-0 rounded-lg bg-[#FF4800] px-3 text-xs font-semibold text-white hover:bg-[#E64000] disabled:opacity-60"
                      >
                        {t(next[1])}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={t("dash.dinein")} subtitle={t("dash.dineinSubtitle", { active: view.tableQueue.length, done: view.tablesDone })} href="/restaurant/table-orders">
          {view.tableQueue.length === 0 ? (
            <EmptyState text={t("dash.emptyDinein")} />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {view.tableQueue.map((o) => (
                <div key={o.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{t("common.table", { table: o.table_no || "—" })}</div>
                    <div className="truncate text-xs text-gray-500">
                      {o.customer_name || t("common.guest")} · {fmt.time(o.created_at)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{mur(o.total_amount)}</div>
                  <OrderPill status={o.booking_status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{t("dash.salesByChannel")}</h2>
            <p className="text-xs text-gray-500">{bounds.days === 1 ? t("dash.byHour") : t("dash.byDay")}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <div key={c.key} className="text-xs">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
                  {t(`dash.channel.${c.key}`)}
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
              labels: chartLabels,
              datasets: CHANNELS.map((c) => ({
                label: t(`dash.channel.${c.key}`),
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

      <Panel title={t("dash.latestReviews")} href="/restaurant/reviews">
        {view.reviews.length === 0 ? (
          <EmptyState text={t("dash.noReviews")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {view.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">{r.username_snapshot || t("common.guest")}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gray-900">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {Number(r.rating || 0).toFixed(1)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                  {fmt.day(ymdInTz(new Date(r.created_at)))}
                  {String(r.owner_reply_text || "").trim() ? (
                    <span className="text-green-600">{t("dash.replied")}</span>
                  ) : (
                    <Link href="/restaurant/reviews" className="font-semibold text-[#FF4800]">
                      {t("dash.action.reply")}
                    </Link>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-gray-700">{r.review_text || t("dash.noWritten")}</p>
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
  const { t } = useI18n();
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
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={tab === item.key}
                  onClick={() => onTab(item.key)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${tab === item.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {href ? (
            <Link href={href} className="whitespace-nowrap text-sm font-medium text-[#FF4800]">
              {t("common.viewAll")}
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
  const { t } = useI18n();
  const s = String(booking.status || "").toLowerCase();
  const [key, cls] =
    s === "pending" && booking.proposed_at
      ? ["dash.pill.newTime", "bg-orange-50 text-orange-700"]
      : s === "pending"
      ? ["dash.pill.request", "bg-amber-50 text-amber-700"]
      : ["dash.pill.confirmed", "bg-green-50 text-green-700"];
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${cls}`}>{t(key)}</span>;
}

const ORDER_PILL_CLASS = {
  NEW: "bg-blue-50 text-blue-700",
  PLACED: "bg-blue-50 text-blue-700",
  ACCEPTED: "bg-blue-50 text-blue-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-violet-50 text-violet-700",
  READY_FOR_PICKUP: "bg-amber-50 text-amber-700",
  SERVED: "bg-emerald-50 text-emerald-700",
};

function OrderPill({ status }) {
  const { t } = useI18n();
  const s = upper(status);
  const label = s ? t(`status.${s}`) : "—";
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${ORDER_PILL_CLASS[s] || "bg-gray-100 text-gray-700"}`}>
      {label === `status.${s}` ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : label}
    </span>
  );
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
