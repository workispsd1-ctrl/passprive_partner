"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function statusLabel(s) {
  return String(s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusClass(s) {
  const v = String(s || "").toUpperCase();
  if (v === "NEW") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "ACCEPTED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (v === "PREPARING") return "border-violet-200 bg-violet-50 text-violet-700";
  if (v === "READY_FOR_PICKUP") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (v === "PICKED_UP" || v === "PAID") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (v === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

const ACTIVE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"];

async function authedFetch(path, opts = {}) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
  return res.json();
}

export default function CashierPickupOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const json = await authedFetch("/api/cashier/dashboard");
      if (json?.ok) setRows(Array.isArray(json?.rows?.pickup_orders) ? json.rows.pickup_orders : []);
    } catch (e) {
      if (!silent) toast.error(e?.message || "Failed to load pickup orders.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 8000);
    const onRefresh = () => load(true);
    window.addEventListener("cashier:refresh", onRefresh);
    return () => { clearInterval(poll); window.removeEventListener("cashier:refresh", onRefresh); };
  }, [load]);

  const update = async (order, patch, key) => {
    if (busyKey) return;
    setBusyKey(`${order.id}:${key}`);
    setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));
    try {
      const json = await authedFetch("/api/cashier/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, ...patch }),
      });
      if (!json?.ok) throw new Error(json?.error || "Failed");
      toast.success("Order updated.");
      await load(true);
    } catch (e) {
      setRows((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      toast.error(e?.message || "Failed to update order.");
    } finally {
      setBusyKey("");
    }
  };

  const { active, closed } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return {
      active: sorted.filter((o) => ACTIVE.includes(String(o.order_status || "").toUpperCase())),
      closed: sorted.filter((o) => !ACTIVE.includes(String(o.order_status || "").toUpperCase())),
    };
  }, [rows]);

  const Card = ({ o }) => {
    const os = String(o.order_status || "").toUpperCase();
    const ps = String(o.payment_status || "").toUpperCase();
    const isDelivered = os === "PICKED_UP";
    const isCancelled = os === "CANCELLED";
    const isPaid = ps === "PAID";
    const busy = busyKey.startsWith(`${o.id}:`);
    const showActions = !isCancelled && (!isDelivered || !isPaid);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-slate-900">{o.order_number || `#${String(o.id).slice(0, 8).toUpperCase()}`}</div>
          {o.pickup_code ? <span className="rounded-lg border border-[#771FA8]/30 bg-[#771FA8]/10 px-2 py-1 text-xs font-bold tracking-wide text-[#771FA8]">{o.pickup_code}</span> : null}
        </div>
        <div className="mt-1 text-sm text-slate-500">{o.customer_name || "Guest"}{o.customer_phone ? ` · ${o.customer_phone}` : ""}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(os)}`}>{statusLabel(os)}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(ps || "PENDING")}`}>{statusLabel(ps || "PENDING")}</span>
          <span className="ml-auto font-bold text-slate-900">{money(o.total_amount)}</span>
        </div>
        {showActions ? (
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={isDelivered || busy} onClick={() => update(o, { order_status: "PICKED_UP" }, "delivered")} className={`h-10 flex-1 rounded-xl text-sm font-semibold ${isDelivered ? "bg-slate-100 text-slate-400" : "bg-blue-600 text-white"} disabled:cursor-not-allowed`}>
              {busy && busyKey === `${o.id}:delivered` ? "…" : isDelivered ? "Delivered" : "Mark Delivered"}
            </button>
            <button type="button" disabled={isPaid || busy} onClick={() => update(o, { payment_status: "PAID" }, "paid")} className={`h-10 flex-1 rounded-xl text-sm font-semibold ${isPaid ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white"} disabled:cursor-not-allowed`}>
              {busy && busyKey === `${o.id}:paid` ? "…" : isPaid ? "Paid" : "Mark Paid"}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Pickup Orders</h1>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No pickup orders yet.</div>
      ) : (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active · {active.length}</div>
          {active.length === 0 ? <div className="text-sm text-slate-500">No active pickup orders.</div> : <div className="space-y-3">{active.map((o) => <Card key={o.id} o={o} />)}</div>}
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Completed / Cancelled · {closed.length}</div>
          {closed.length === 0 ? <div className="text-sm text-slate-500">Nothing here yet.</div> : <div className="space-y-3">{closed.map((o) => <Card key={o.id} o={o} />)}</div>}
        </>
      )}
    </div>
  );
}
