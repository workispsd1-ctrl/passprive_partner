"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, QrCode, Package, IndianRupee, Receipt } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const ROWS_PER_PAGE = 10;

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

const TABLE_ORDER_STATUSES = ["PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "CANCELLED"];

function Tile({ title, value, subtitle, icon: Icon, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-3xl border p-6 text-left shadow-sm transition ${
        active ? "border-[#771FA8] bg-[#F4E7D1]" : "border-slate-200 bg-white hover:border-[#771FA8]/30"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-600">{title}</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className="h-12 w-12 rounded-2xl bg-[#F4E7D1] text-[#771FA8] flex items-center justify-center">
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </button>
  );
}

export default function CashierDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState("bookings");
  const [activeTile, setActiveTile] = useState("bookings");
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState("");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const load = async (minSkeletonMs = 0) => {
    setLoading(true);
    setError("");

    try {
      const startedAt = Date.now();
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load dashboard.");
      setData(json);

      const elapsed = Date.now() - startedAt;
      const waitMore = minSkeletonMs - elapsed;
      if (waitMore > 0) await sleep(waitMore);
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load(700);
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  const k = data?.kpis || {};
  const rows = data?.rows || {};

  const tiles = useMemo(
    () => [
      { key: "bookings", view: "bookings", title: "Bookings", value: k.bookings_total ?? 0, subtitle: `${k.bookings_pending ?? 0} pending`, icon: CalendarCheck },
      { key: "table_orders", view: "table_orders", title: "Table Orders", value: k.table_orders_total ?? 0, subtitle: `${k.table_orders_active ?? 0} active`, icon: QrCode },
      { key: "pickup_orders", view: "pickup_orders", title: "Pickup Orders", value: k.pickup_active ?? 0, subtitle: "currently active", icon: Package },
      { key: "bill_payments", view: "bill_payments", title: "Bill Payments", value: k.bill_payments_pending ?? 0, subtitle: "pending collections", icon: Receipt },
      { key: "revenue_today", view: "payment_sessions", title: "Revenue Today", value: money(k.revenue_today ?? 0), subtitle: "from payment sessions", icon: IndianRupee },
    ],
    [k]
  );

  const currentRows = useMemo(() => {
    const r =
      activeView === "bookings"
        ? rows.bookings || []
        : activeView === "table_orders"
        ? rows.table_orders || []
        : activeView === "bill_payments"
        ? rows.bill_payments || []
        : activeView === "payment_sessions"
        ? rows.payment_sessions || []
        : rows.pickup_orders || [];
    return Array.isArray(r) ? r : [];
  }, [rows, activeView]);

  const updateTableOrderStatus = async (id, booking_status) => {
    setUpdatingId(id);
    setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/table-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, booking_status }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update status.");

      setData((prev) => {
        const current = prev || {};
        const rowsSafe = current.rows || {};
        const patchRows = (arr) =>
          Array.isArray(arr) ? arr.map((r) => (r.id === id ? { ...r, booking_status } : r)) : [];
        return {
          ...current,
          rows: {
            ...rowsSafe,
            table_orders: patchRows(rowsSafe.table_orders || []),
            bill_payments: patchRows(rowsSafe.bill_payments || []),
          },
        };
      });
    } catch (e) {
      setError(e?.message || "Failed to update status.");
    } finally {
      setUpdatingId("");
    }
  };

  const totalPages = Math.max(1, Math.ceil(currentRows.length / ROWS_PER_PAGE));
  const pagedRows = currentRows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [activeView]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [totalPages, page]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="mt-3 h-9 w-24 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-36 rounded bg-slate-100" />
                </div>
                <div className="h-12 w-12 rounded-2xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Tile
            key={t.key}
            {...t}
            active={activeTile === t.key}
            onClick={() => {
              setActiveTile(t.key);
              setActiveView(t.view);
            }}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTile("bookings");
                setActiveView("bookings");
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold border ${
                activeView === "bookings" ? "bg-[#F4E7D1] border-[#771FA8] text-[#771FA8]" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              Bookings
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTile("table_orders");
                setActiveView("table_orders");
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold border ${
                activeView === "table_orders" ? "bg-[#F4E7D1] border-[#771FA8] text-[#771FA8]" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              Table Orders
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTile("pickup_orders");
                setActiveView("pickup_orders");
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold border ${
                activeView === "pickup_orders" ? "bg-[#F4E7D1] border-[#771FA8] text-[#771FA8]" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              Pickup Orders
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTile("bill_payments");
                setActiveView("bill_payments");
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold border ${
                activeView === "bill_payments" ? "bg-[#F4E7D1] border-[#771FA8] text-[#771FA8]" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              Bill Payments
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTile("revenue_today");
                setActiveView("payment_sessions");
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold border ${
                activeView === "payment_sessions" ? "bg-[#F4E7D1] border-[#771FA8] text-[#771FA8]" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              Revenue Sessions
            </button>
          </div>
          <div className="text-xs text-slate-500">Showing {pagedRows.length} of {currentRows.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Meta</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">No rows found.</td>
                </tr>
              ) : (
                pagedRows.map((r) => {
                  const isBooking = activeView === "bookings";
                  const isTable = activeView === "table_orders" || activeView === "bill_payments";
                  const isPayment = activeView === "payment_sessions";
                  const status = isBooking ? r.status : isTable ? r.booking_status : isPayment ? r.status : r.order_status;
                  const meta = isBooking
                    ? `${r.booking_date || "—"} ${String(r.booking_time || "").slice(0, 5) || ""}`
                    : isTable
                    ? `Table ${r.table_no || "—"}`
                    : isPayment
                    ? `${r.payment_context || "PAYMENT"} • ${r.currency_code || "MUR"}`
                    : `Code ${r.pickup_code || "—"}`;
                  const amount = isTable || activeView === "pickup_orders"
                    ? money(r.total_amount)
                    : isPayment
                    ? money(r.amount_major)
                    : "—";
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">#{String(r.id).slice(0, 8)}</td>
                      <td className="px-3 py-2">{isPayment ? r.tracking_id || "—" : r.customer_name || "Guest"}</td>
                      <td className="px-3 py-2">{isPayment ? r.merchant_trace || "—" : r.customer_phone || "—"}</td>
                      <td className="px-3 py-2">{meta}</td>
                      <td className="px-3 py-2">
                        {isTable ? (
                          <select
                            value={String(status || "PLACED").toUpperCase()}
                            onChange={(e) => updateTableOrderStatus(r.id, e.target.value)}
                            disabled={updatingId === r.id}
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                          >
                            {TABLE_ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          String(status || "").toUpperCase()
                        )}
                      </td>
                      <td className="px-3 py-2">{amount}</td>
                      <td className="px-3 py-2">{fmtDateTime(r.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Previous
          </button>
          <div className="text-xs text-slate-500">Page {page + 1} of {totalPages}</div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
