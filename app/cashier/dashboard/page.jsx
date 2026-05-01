"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarCheck, QrCode, Package, DollarSign, Receipt, Clock3, Users, Phone, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

function statusPill(status) {
  const s = String(status || "").toLowerCase();
  if (["confirmed", "preparing", "placed", "pending", "new"].includes(s)) return "bg-amber-100 text-amber-800";
  if (["served", "completed", "finalized", "paid", "payment_successfull"].includes(s)) return "bg-emerald-100 text-emerald-800";
  if (["cancelled", "failed", "error", "no_show"].includes(s)) return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function KpiCard({ title, value, subtitle, icon: Icon, tone = "violet" }) {
  const tones = {
    violet: "from-violet-500 to-fuchsia-500",
    blue: "from-blue-500 to-cyan-500",
    green: "from-emerald-500 to-teal-500",
    orange: "from-orange-500 to-amber-500",
    pink: "from-pink-500 to-rose-500",
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${tones[tone]} text-white flex items-center justify-center shadow-sm`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

export default function CashierDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

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
    () => (rows.table_orders || []).filter((o) => !["completed", "cancelled", "paid"].includes(String(o.booking_status || "").toLowerCase())),
    [rows.table_orders]
  );

  const todaysBookings = useMemo(() => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    return (rows.bookings || [])
      .filter((b) => String(b.booking_date || "") === todayKey)
      .sort((a, b) => String(a.booking_time || "").localeCompare(String(b.booking_time || "")));
  }, [rows.bookings]);

  const recentPayments = useMemo(
    () => (rows.payment_sessions || []).slice(0, 6),
    [rows.payment_sessions]
  );

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


      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Bookings" value={k.bookings_total || 0} subtitle={`${k.bookings_pending || 0} pending`} icon={CalendarCheck} tone="violet" />
        <KpiCard title="QR Orders" value={k.table_orders_total || 0} subtitle={`${k.table_orders_active || 0} active`} icon={QrCode} tone="blue" />
        <KpiCard title="Pickup" value={k.pickup_active || 0} subtitle="active pickups" icon={Package} tone="orange" />
        <KpiCard title="Bill Pending" value={k.bill_payments_pending || 0} subtitle="awaiting collection" icon={Receipt} tone="pink" />
        <KpiCard title="Collected" value={money(k.revenue_today || 0)} subtitle="verified sessions" icon={DollarSign} tone="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Order Confirmations</h2>
              <p className="text-sm text-slate-500">Track active QR/table orders and respond fast.</p>
            </div>
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{activeQrOrders.length} Active</span>
          </div>
          <div className="max-h-[28rem] overflow-y-auto p-4 space-y-3">
            {activeQrOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No active QR orders right now.</div>
            ) : (
              activeQrOrders.map((o) => (
                <div key={o.id} className="rounded-2xl border border-slate-200 p-4 hover:border-violet-300 transition">
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
                </div>
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
                  <div key={b.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{fmtBookingTime(b.booking_time)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill(b.status)}`}>{String(b.status || "pending").toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{b.customer_name || "Guest"}</p>
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {b.party_size || 0} guests</p>
                  </div>
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
