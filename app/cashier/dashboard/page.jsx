"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarCheck, QrCode, Package, DollarSign, Receipt, Clock3, Users, Phone, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "MUR 0.00";
  return `MUR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTimeFromDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtBookingTime(v) {
  if (!v) return "-";
  const [h, m] = String(v).split(":");
  const d = new Date();
  d.setHours(Number(h || 0), Number(m || 0), 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function hourLabel(hour24) {
  const d = new Date();
  d.setHours(hour24, 0, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesFromDateTime(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function statusPill(status) {
  const s = String(status || "").toLowerCase();
  if (["confirmed", "preparing", "placed", "pending", "new"].includes(s)) return "bg-amber-100 text-amber-800";
  if (["served", "completed", "finalized", "paid", "payment_successfull"].includes(s)) return "bg-emerald-100 text-emerald-800";
  if (["cancelled", "failed", "error", "no_show"].includes(s)) return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function KpiCard({ title, value, subtitle, icon: Icon, tone = "violet", onClick }) {
  const tones = {
    violet: "from-violet-500 to-fuchsia-500",
    blue: "from-blue-500 to-cyan-500",
    green: "from-emerald-500 to-teal-500",
    orange: "from-orange-500 to-amber-500",
    pink: "from-pink-500 to-rose-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm min-h-[142px] flex items-center text-left hover:border-violet-300 transition"
    >
      <div className="flex w-full items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 leading-none">{value}</p>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${tones[tone]} text-white flex items-center justify-center shadow-sm`}>
          <Icon className="h-5.5 w-5.5" />
        </div>
      </div>
    </button>
  );
}

export default function CashierDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [layoutTables, setLayoutTables] = useState([]);
  const [showAllTimelines, setShowAllTimelines] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load dashboard.");
      setData(json);

      const tableRes = await fetch("/api/cashier/table-layout", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tableJson = await tableRes.json();
      if (tableRes.ok && tableJson?.ok && Array.isArray(tableJson?.tables)) {
        setLayoutTables(tableJson.tables);
      } else {
        setLayoutTables([]);
      }
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  const k = data?.kpis || {};
  const rows = data?.rows || {};

  const activeQrOrders = useMemo(
    () =>
      (rows.table_orders || []).filter((o) => {
        const rowDate = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
        if (rowDate !== selectedDate) return false;
        return !["completed", "cancelled", "paid"].includes(String(o.booking_status || "").toLowerCase());
      }),
    [rows.table_orders, selectedDate]
  );

  const todaysBookings = useMemo(() => {
    const todayKey = selectedDate;
    return (rows.bookings || [])
      .filter((b) => String(b.booking_date || "") === todayKey)
      .sort((a, b) => String(a.booking_time || "").localeCompare(String(b.booking_time || "")));
  }, [rows.bookings, selectedDate]);

  const recentPayments = useMemo(
    () =>
      (rows.payment_sessions || [])
        .filter((p) => {
          const rowDate = p?.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "";
          return rowDate === selectedDate;
        })
        .slice(0, 6),
    [rows.payment_sessions, selectedDate]
  );
  const dateFilteredBookings = useMemo(
    () => (rows.bookings || []).filter((b) => String(b.booking_date || "") === selectedDate),
    [rows.bookings, selectedDate]
  );
  const dateFilteredTableOrders = useMemo(
    () =>
      (rows.table_orders || []).filter((o) => {
        const d = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
        return d === selectedDate;
      }),
    [rows.table_orders, selectedDate]
  );
  const dateFilteredPickup = useMemo(
    () =>
      (rows.pickup_orders || []).filter((o) => {
        const d = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
        return d === selectedDate;
      }),
    [rows.pickup_orders, selectedDate]
  );
  const dateFilteredPayments = useMemo(
    () =>
      (rows.payment_sessions || []).filter((p) => {
        const d = p?.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "";
        return d === selectedDate;
      }),
    [rows.payment_sessions, selectedDate]
  );
  const derivedKpis = useMemo(() => {
    const bookingsPending = dateFilteredBookings.filter((b) => String(b.status || "").toLowerCase() === "pending").length;
    const tableOrdersActive = dateFilteredTableOrders.filter((o) => !["served", "cancelled", "paid", "completed"].includes(String(o.booking_status || "").toLowerCase())).length;
    const pickupActive = dateFilteredPickup.filter((o) => ["new", "accepted", "preparing", "ready_for_pickup"].includes(String(o.order_status || "").toLowerCase())).length;
    const billPending = dateFilteredPayments.filter((p) => {
      const s = String(p.status || "").toUpperCase();
      return String(p.payment_context || "").toUpperCase() === "TABLE_ORDERS" && !["VERIFIED_SUCCESS", "FINALIZED", "VERIFIED_FAILED", "CANCELLED", "ERROR"].includes(s);
    }).length;
    const collected = dateFilteredPayments
      .filter((p) => ["VERIFIED_SUCCESS", "FINALIZED"].includes(String(p.status || "").toUpperCase()))
      .reduce((sum, p) => sum + Number(p.amount_major || 0), 0);
    return {
      bookingsTotal: dateFilteredBookings.length,
      bookingsPending,
      tableOrdersTotal: dateFilteredTableOrders.length,
      tableOrdersActive,
      pickupActive,
      billPending,
      collected,
    };
  }, [dateFilteredBookings, dateFilteredTableOrders, dateFilteredPickup, dateFilteredPayments]);
  const openingHour = 8;
  const closingHour = 23;
  const bookingTimelineHours = useMemo(
    () => Array.from({ length: closingHour - openingHour + 1 }, (_, i) => i + openingHour),
    [openingHour, closingHour]
  );
  const tableNumbers = useMemo(() => {
    if (layoutTables.length) {
      return [...layoutTables]
        .map((t) => Number(t.table_no))
        .filter((n) => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);
    }
    const fromOrders = [...new Set((rows.table_orders || []).map((o) => Number(o.table_no)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
    return fromOrders;
  }, [layoutTables, rows.table_orders]);
  const activeByTable = useMemo(() => {
    const map = new Map();
    (activeQrOrders || []).forEach((o) => {
      const t = Number(o.table_no || 0);
      if (!Number.isInteger(t) || t <= 0) return;
      const next = map.get(t) || [];
      next.push(o);
      map.set(t, next);
    });
    return map;
  }, [activeQrOrders]);
  const activeTableNumbers = useMemo(
    () => [...activeByTable.keys()].sort((a, b) => a - b),
    [activeByTable]
  );
  const visibleTableNumbers = useMemo(() => {
    if (showAllTimelines) return tableNumbers;
    if (!tableNumbers.length) return [];
    const prioritized = [...activeTableNumbers, ...tableNumbers.filter((n) => !activeTableNumbers.includes(n))];
    return prioritized.slice(0, 2);
  }, [showAllTimelines, tableNumbers, activeTableNumbers]);
  const timelineBookingsByTable = useMemo(() => {
    const map = new Map();
    if (!tableNumbers.length) return map;
    let rotateIdx = 0;
    todaysBookings.forEach((b) => {
      let t = Number(b.table_no);
      if (!Number.isInteger(t) || t <= 0 || !tableNumbers.includes(t)) {
        t = tableNumbers[rotateIdx % tableNumbers.length];
        rotateIdx += 1;
      }
      const next = map.get(t) || [];
      next.push(b);
      map.set(t, next);
    });
    return map;
  }, [todaysBookings, tableNumbers]);
  const tableEventTokens = useMemo(() => {
    const map = new Map();
    const pushToken = (tableNo, token) => {
      if (!Number.isInteger(tableNo) || tableNo <= 0) return;
      const next = map.get(tableNo) || [];
      next.push(token);
      map.set(tableNo, next);
    };

    (rows.table_orders || []).forEach((o) => {
      const createdDate = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
      if (createdDate !== selectedDate) return;
      const t = Number(o.table_no || 0);
      const minute = minutesFromDateTime(o.created_at);
      if (minute == null) return;
      pushToken(t, {
        id: `qr-${o.id}`,
        minute,
        type: "QR",
        color: "bg-blue-500",
        title: `QR • T${t} • ${o.customer_name || "Guest"}`,
        lines: [
          `Order #${String(o.id).slice(0, 8)}`,
          `Status: ${String(o.booking_status || "PLACED").toUpperCase()}`,
          `Payment: ${String(o.payment_status || "PENDING").toUpperCase()}`,
          `Total: ${money(o.total_amount || 0)}`,
        ],
      });
    });

    (rows.pickup_orders || []).forEach((o, idx) => {
      const createdDate = o?.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "";
      if (createdDate !== selectedDate) return;
      const minute = minutesFromDateTime(o.created_at);
      if (minute == null || !tableNumbers.length) return;
      const fallbackTable = tableNumbers[idx % tableNumbers.length];
      pushToken(fallbackTable, {
        id: `pickup-${o.id}`,
        minute,
        type: "P",
        color: "bg-amber-500",
        title: `Pickup • ${o.customer_name || "Guest"}`,
        lines: [
          `Order #${String(o.order_number || o.id).slice(0, 8)}`,
          `Status: ${String(o.order_status || "NEW").toUpperCase()}`,
          `Payment: ${String(o.payment_status || "PENDING").toUpperCase()}`,
          `Total: ${money(o.total_amount || 0)}`,
        ],
      });
    });

    return map;
  }, [rows.table_orders, rows.pickup_orders, tableNumbers, selectedDate]);
  const groupedTimelineTokens = useMemo(() => {
    const grouped = new Map();
    const keyFor = (tableNo, minute) => `${tableNo}-${Math.floor(minute / 60)}`;
    const pushGrouped = (tableNo, minute, event) => {
      const k = keyFor(tableNo, minute);
      const current = grouped.get(k) || { tableNo, minuteBucket: Math.floor(minute / 60), events: [] };
      current.events.push(event);
      grouped.set(k, current);
    };

    tableNumbers.forEach((tableNo) => {
      const bookingEvents = timelineBookingsByTable.get(tableNo) || [];
      bookingEvents.forEach((b) => {
        const minute = toMinutes(b.booking_time);
        if (minute == null) return;
        pushGrouped(tableNo, minute, {
          type: "BOOKING",
          label: `${fmtBookingTime(b.booking_time)} • ${b.party_size || 0} guests`,
          subtitle: `${b.customer_name || "Guest"} • ${String(b.status || "pending").toUpperCase()}`,
        });
      });
      const rawTokens = tableEventTokens.get(tableNo) || [];
      rawTokens.forEach((t) => {
        pushGrouped(tableNo, t.minute, {
          type: t.type === "QR" ? "QR ORDER" : "PICKUP",
          label: t.lines?.[0] || t.title,
          subtitle: `${t.lines?.[1] || ""} ${t.lines?.[3] || ""}`.trim(),
        });
      });
    });

    return grouped;
  }, [tableNumbers, timelineBookingsByTable, tableEventTokens]);
  const calendarDays = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dt = new Date(y, m, d);
      cells.push(dt.toISOString().slice(0, 10));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-28 rounded-3xl border border-slate-200 bg-white" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-36 rounded-3xl border border-slate-200 bg-white" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="h-[28rem] rounded-3xl border border-slate-200 bg-white xl:col-span-2" />
          <div className="h-[28rem] rounded-3xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <section className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm min-h-[142px] xl:row-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</p>
            <CalendarDays className="h-5 w-5 text-violet-600" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="h-7 w-7 rounded-md border border-slate-300 text-slate-600"
            >
              ‹
            </button>
            <p className="text-sm font-semibold text-slate-800">
              {calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="h-7 w-7 rounded-md border border-slate-300 text-slate-600"
            >
              ›
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] font-semibold text-slate-500">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => <div key={`${d}-${idx}`} className="text-center">{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((dateIso, idx) => {
              if (!dateIso) return <div key={`empty-${idx}`} className="h-7" />;
              const active = dateIso === selectedDate;
              return (
                <button
                  key={dateIso}
                  type="button"
                  onClick={() => setSelectedDate(dateIso)}
                  className={`h-7 rounded-md text-[11px] ${active ? "bg-violet-600 text-white font-semibold" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                >
                  {Number(dateIso.slice(-2))}
                </button>
              );
            })}
          </div>
        </div>
        <KpiCard title="Bookings" value={derivedKpis.bookingsTotal} subtitle={`${derivedKpis.bookingsPending} pending`} icon={CalendarCheck} tone="violet" onClick={() => router.push("/cashier/bookings")} />
        <KpiCard title="QR Orders" value={derivedKpis.tableOrdersTotal} subtitle={`${derivedKpis.tableOrdersActive} active`} icon={QrCode} tone="blue" onClick={() => router.push("/cashier/table-orders")} />
        <KpiCard title="Pickup" value={derivedKpis.pickupActive} subtitle="active pickups" icon={Package} tone="orange" onClick={() => router.push("/cashier/pickup-orders")} />
        <KpiCard title="Collected" value={money(derivedKpis.collected)} subtitle="verified sessions" icon={DollarSign} tone="green" onClick={() => router.push("/cashier/dashboard")} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white overflow-visible">
        <div className="border-b border-slate-100 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Booking Time Flow</h2>
          <span className="text-xs text-slate-500">{fmtDate(selectedDate)} • {todaysBookings.length} bookings • {hourLabel(openingHour)} - {hourLabel(closingHour)}</span>
        </div>
        <div
          className="overflow-x-auto overflow-y-visible px-4 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ overflowY: "visible" }}
        >
          <div className="min-w-[1800px]">
            <div className="grid gap-3" style={{ gridTemplateColumns: `88px repeat(${bookingTimelineHours.length}, minmax(84px, 1fr))` }}>
              <div />
              {bookingTimelineHours.map((h) => (
                <div key={`h-${h}`} className="px-2 text-center text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  {hourLabel(h)}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {tableNumbers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">No tables found in table layout.</div>
              ) : (
                visibleTableNumbers.map((tableNo, rowIndex) => {
                  const bookingsForTable = timelineBookingsByTable.get(tableNo) || [];
                  const openUpward = rowIndex >= Math.floor(visibleTableNumbers.length / 2);
                  return (
                    <div key={`row-t-${tableNo}`} className="relative z-0 hover:z-[110] grid items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 overflow-visible" style={{ gridTemplateColumns: `88px repeat(${bookingTimelineHours.length}, minmax(84px, 1fr))` }}>
                      <div className={`rounded-xl px-3 py-2 text-center text-sm font-bold ${bookingsForTable.length ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-700"}`}>T{tableNo}</div>
                      <div
                        className="col-span-full -mt-[3.25rem] relative h-12"
                        style={{ marginLeft: "88px", width: "calc(100% - 88px)" }}
                      >
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${bookingTimelineHours.length}, minmax(84px, 1fr))` }}>
                          {bookingTimelineHours.map((h, idx) => (
                            <div
                              key={`grid-${tableNo}-${h}`}
                              className={`border-l border-slate-200 ${((idx + Number(tableNo) + 1) % 2 === 0) ? "bg-slate-50/60" : "bg-slate-50/30"} ${idx === bookingTimelineHours.length - 1 ? "border-r" : ""}`}
                            />
                          ))}
                        </div>
                        {Array.from(groupedTimelineTokens.values()).filter((g) => g.tableNo === tableNo).map((group) => {
                          const totalMin = (closingHour - openingHour) * 60;
                          const offsetMin = group.minuteBucket * 60 - openingHour * 60;
                          if (offsetMin < 0 || offsetMin > totalMin) return null;
                          const leftPct = (offsetMin / totalMin) * 100;
                          const eventCount = group.events.length;
                          return (
                            <div key={`group-${tableNo}-${group.minuteBucket}`} className="group absolute top-1.5 z-[120] hover:z-[130]" style={{ left: `${leftPct}%` }}>
                              <div className="h-8 min-w-[34px] rounded-full border border-violet-300 bg-violet-500 px-2 text-[11px] font-bold leading-8 text-white shadow-md text-center">{eventCount}</div>
                              <div
                                className={`pointer-events-none absolute z-[200] hidden min-w-[290px] max-w-[360px] rounded-2xl border border-slate-200 bg-white p-3 text-left text-[11px] text-slate-700 shadow-2xl group-hover:block ${
                                  leftPct > 75 ? "right-0" : "left-0"
                                } ${openUpward ? "bottom-10" : "top-10"}`}
                              >
                                <p className="font-semibold text-slate-900">Table {tableNo} • {hourLabel(group.minuteBucket)}</p>
                                <p className="mt-0.5 text-[10px] text-slate-500">{eventCount} event{eventCount > 1 ? "s" : ""} in this slot</p>
                                <div className="mt-2 space-y-1.5">
                                  {group.events.map((ev, idx) => (
                                    <div key={`ev-${tableNo}-${group.minuteBucket}-${idx}`} className="rounded-lg bg-slate-50 px-2 py-1.5">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">{ev.type}</p>
                                      <p className="font-medium text-slate-800">{ev.label}</p>
                                      {ev.subtitle ? <p className="text-[10px] text-slate-600">{ev.subtitle}</p> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {bookingTimelineHours.map((h) => <div key={`cell-${tableNo}-${h}`} className="h-1" />)}
                    </div>
                  );
                })
              )}
            </div>
            {tableNumbers.length > 2 ? (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => setShowAllTimelines((v) => !v)} className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-400 hover:text-violet-700">
                  {showAllTimelines ? "Show less" : "Show more"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Order Confirmations</h2>
              
            </div>
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{activeQrOrders.length} Active</span>
          </div>
          <div className="max-h-[18rem] overflow-y-auto p-4 space-y-3">
            {activeQrOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No active QR orders right now.</div>
            ) : (
              activeQrOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => router.push(`/cashier/table-orders?order_id=${encodeURIComponent(String(o.id || ""))}`)}
                  className="w-full rounded-2xl border border-slate-200 p-4 hover:border-violet-300 transition text-left"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">Order #{String(o.id).slice(0, 8)} • Table {o.table_no || "-"}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusPill(o.booking_status)}`}>{String(o.booking_status || "PLACED").toUpperCase()}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <p className="flex items-center gap-2"><UserRound className="h-4 w-4" /> {o.customer_name || "Guest"}</p>
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> {o.customer_phone || "-"}</p>
                    <p className="flex items-center gap-2"><DollarSign className="h-4 w-4" /> {money(o.total_amount || 0)}</p>
                    <p className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> {fmtTimeFromDateTime(o.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Bookings Timeline</h3>
              <p className="text-xs text-slate-500 mt-1">Today&apos;s dining schedule</p>
            </div>
            <div className="max-h-72 overflow-y-auto p-4 space-y-2">
              {todaysBookings.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No bookings for today.</div>
              ) : (
                todaysBookings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => router.push(`/cashier/bookings?booking_id=${encodeURIComponent(String(b.id || ""))}`)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-violet-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{fmtBookingTime(b.booking_time)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill(b.status)}`}>{String(b.status || "pending").toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{b.customer_name || "Guest"}</p>
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {b.party_size || 0} guests</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Calendar Snapshot</h3>
            <p className="mt-1 text-xs text-slate-500">Today: {fmtDate(new Date())}</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-700">Total bookings today: <span className="font-semibold">{todaysBookings.length}</span></p>
              <p className="mt-2 text-sm text-slate-700">Pending confirmations: <span className="font-semibold">{Number(k.bookings_pending || 0)}</span></p>
              <p className="mt-2 text-sm text-slate-700">Active QR orders: <span className="font-semibold">{activeQrOrders.length}</span></p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Payment Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left">Tracking</th>
                <th className="px-4 py-2 text-left">Context</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentPayments.length === 0 ? (
                <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={5}>No payment sessions yet.</td></tr>
              ) : (
                recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.tracking_id || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.payment_context || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{money(p.amount_major || 0)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusPill(p.status)}`}>{String(p.status || "-").toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(p.created_at)} {fmtTimeFromDateTime(p.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
