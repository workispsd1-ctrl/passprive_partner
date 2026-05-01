"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode, Clock3, ReceiptText, UserRound, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const STATUS = ["PLACED", "CONFIRMED", "PREPARING", "SERVED", "CANCELLED"];

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusClass(s) {
  const v = String(s || "").toUpperCase();
  if (v === "PLACED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (v === "CONFIRMED") return "border-sky-200 bg-sky-50 text-sky-800";
  if (v === "PREPARING") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (v === "SERVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (v === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function paymentClass(s) {
  const v = String(s || "").toUpperCase();
  if (v === "PAID" || v === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function fmtDateTime(v) {
  const d = new Date(String(v || ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function extractItems(row) {
  if (Array.isArray(row?.order_items)) return row.order_items;
  const details = row?.order_details;
  if (details && typeof details === "object") {
    if (Array.isArray(details.items)) return details.items;
    if (Array.isArray(details.order_items)) return details.order_items;
    if (details.order_snapshot && Array.isArray(details.order_snapshot.items)) return details.order_snapshot.items;
  }
  return [];
}

function TableOrdersSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="h-5 w-44 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 rounded bg-slate-100" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function CashierTableOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/table-orders", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load table orders.");
      const list = Array.isArray(json?.orders) ? json.orders : [];
      setRows(list);
      if (selectedOrderId && !list.some((x) => x.id === selectedOrderId)) setSelectedOrderId("");
    } catch (e) {
      setError(e?.message || "Failed to load table orders.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load({ silent: true });
    }, 7000);
    return () => window.clearInterval(id);
  }, []);

  const updateStatus = async (id, booking_status) => {
    setUpdatingId(id);
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
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, booking_status } : r)));
    } catch (e) {
      setError(e?.message || "Failed to update status.");
    } finally {
      setUpdatingId("");
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => ["PLACED", "CONFIRMED", "PREPARING"].includes(String(r.booking_status || "").toUpperCase())).length;
    const served = rows.filter((r) => String(r.booking_status || "").toUpperCase() === "SERVED").length;
    const paid = rows.filter((r) => ["PAID", "COMPLETED"].includes(String(r.payment_status || "").toUpperCase())).length;
    return { total, active, served, paid };
  }, [rows]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedOrderId) || null, [rows, selectedOrderId]);

  if (loading) return <TableOrdersSkeleton />;

  return (
    <div className="space-y-4">
     

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2"><div className="text-xs text-violet-700 font-semibold">Total</div><div className="text-lg font-bold text-violet-900">{stats.total}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"><div className="text-xs text-amber-700 font-semibold">Active</div><div className="text-lg font-bold text-amber-900">{stats.active}</div></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"><div className="text-xs text-emerald-700 font-semibold">Served</div><div className="text-lg font-bold text-emerald-900">{stats.served}</div></div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2"><div className="text-xs text-sky-700 font-semibold">Paid</div><div className="text-lg font-bold text-sky-900">{stats.paid}</div></div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No QR orders yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((o) => {
              const items = extractItems(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOrderId(o.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selectedOrderId === o.id ? "bg-violet-50/40" : "bg-white"}`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
                    <div className="md:col-span-2">
                      <div className="font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                      <div className="text-xs text-slate-500">{fmtDateTime(o.created_at)}</div>
                    </div>
                    <div className="text-sm text-slate-700">T{o.table_no || "—"}</div>
                    <div className="text-sm text-slate-700">{o.customer_name || "Guest"}</div>
                    <div className="text-sm font-semibold text-slate-900">{money(o.total_amount)}</div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentClass(o.payment_status)}`}>
                        {String(o.payment_status || "PENDING").toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">{items.length} item(s)</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={() => setSelectedOrderId("")} />
          <div className="absolute right-0 top-0 h-full w-full lg:w-[calc(100%-16rem)] bg-white border-l border-slate-200 shadow-2xl pointer-events-auto overflow-auto">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">QR Order #{String(selected.id).slice(0, 8)}</h3>
                <p className="text-xs text-slate-500">Table T{selected.table_no || "—"} • {fmtDateTime(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelectedOrderId("")} className="h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="inline-flex items-center gap-2"><UserRound className="h-4 w-4" /> {selected.customer_name || "Guest"}</div>
                <div className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {fmtDateTime(selected.created_at)}</div>
                <div className="inline-flex items-center gap-2"><ReceiptText className="h-4 w-4" /> {money(selected.total_amount)}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-900 mb-2">Items</div>
                <div className="space-y-2">
                  {extractItems(selected).length === 0 ? (
                    <div className="text-xs text-slate-500">No item details available.</div>
                  ) : (
                    extractItems(selected).map((it, idx) => (
                      <div key={`${selected.id}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <div className="text-slate-800">{it?.name || "Item"} x {Number(it?.qty || 0)}</div>
                        <div className="font-semibold text-slate-900">{money(Number(it?.line_total || Number(it?.qty || 0) * Number(it?.unit_price || 0)))}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-900 mb-2">Order Controls</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(selected.booking_status)}`}>
                    {String(selected.booking_status || "PLACED").toUpperCase()}
                  </span>
                  <select
                    value={String(selected.booking_status || "PLACED").toUpperCase()}
                    onChange={(e) => updateStatus(selected.id, e.target.value)}
                    disabled={updatingId === selected.id}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold"
                  >
                    {STATUS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentClass(selected.payment_status)}`}>
                    Payment {String(selected.payment_status || "PENDING").toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
