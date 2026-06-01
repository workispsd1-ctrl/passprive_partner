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
  if (v === "PLACED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "CONFIRMED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (v === "PREPARING") return "border-violet-200 bg-violet-50 text-violet-700";
  if (v === "SERVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (v === "COMPLETED" || v === "PAID") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (v === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
function isStaffPlaced(o) {
  const src = String(o?.source || "").toLowerCase();
  if (["cashier", "staff_pad", "bearer_platform", "staff"].includes(src)) return true;
  const od = o?.order_details || {};
  return od.source_channel === "cashier_orders" || od.created_by === "cashier" || od.placed_by === "staff_pad" || od.is_staff_initiated === true;
}
function extractItems(o) {
  const raw =
    (Array.isArray(o?.order_items) && o.order_items.length && o.order_items) ||
    (Array.isArray(o?.order_details?.items) && o.order_details.items) ||
    [];
  return raw.map((it) => ({ name: String(it?.name || it?.item_name || "Item"), qty: Number(it?.qty ?? it?.quantity ?? 1) }));
}

async function authedFetch(path, opts = {}) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
  return res.json();
}

function isActive(o) {
  const bs = String(o.booking_status || "").toUpperCase();
  const ps = String(o.payment_status || "").toUpperCase();
  if (["COMPLETED", "PAID", "CANCELLED"].includes(bs)) return false;
  if (["PAID", "COMPLETED"].includes(ps)) return false;
  return true;
}

export default function CashierWalkInOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const json = await authedFetch("/api/cashier/table-layout");
      if (json?.ok) {
        const all = Array.isArray(json.orders) ? json.orders : [];
        setRows(all.filter(isStaffPlaced));
      }
    } catch (e) {
      if (!silent) toast.error(e?.message || "Failed to load walk-in orders.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 7000);
    const onRefresh = () => load(true);
    window.addEventListener("cashier:refresh", onRefresh);
    return () => { clearInterval(poll); window.removeEventListener("cashier:refresh", onRefresh); };
  }, [load]);

  const update = async (order, body, key) => {
    if (busyKey) return;
    setBusyKey(`${order.id}:${key}`);
    try {
      const json = await authedFetch("/api/cashier/table-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_order_state", order_id: order.id, ...body }),
      });
      if (!json?.ok) throw new Error(json?.error || "Failed");
      toast.success("Order updated.");
      await load(true);
    } catch (e) {
      toast.error(e?.message || "Failed to update order.");
    } finally {
      setBusyKey("");
    }
  };

  const { active, closed } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return { active: sorted.filter(isActive), closed: sorted.filter((o) => !isActive(o)) };
  }, [rows]);

  const Card = ({ o }) => {
    const bs = String(o.booking_status || "").toUpperCase();
    const ps = String(o.payment_status || "").toUpperCase();
    const isPaid = ps === "PAID" || ps === "COMPLETED" || bs === "PAID";
    const completedDone = bs === "COMPLETED" || isPaid;
    const busy = busyKey.startsWith(`${o.id}:`);
    const items = extractItems(o);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 min-w-10 items-center justify-center rounded-xl bg-[#771FA8]/10 px-2 text-sm font-bold text-[#771FA8]">{Number(o.table_no) > 0 ? `T${o.table_no}` : "—"}</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 6).toUpperCase()}</div>
              <div className="text-xs text-slate-500">{o.customer_name || "Walk-in"}</div>
            </div>
          </div>
          <span className="font-bold text-slate-900">{money(o.total_amount)}</span>
        </div>

        {items.length > 0 ? (
          <div className="mt-2 text-xs text-slate-600 line-clamp-1">{items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(bs)}`}>{statusLabel(bs || "PLACED")}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(ps || "PENDING")}`}>{statusLabel(ps || "PENDING")}</span>
        </div>

        {isActive(o) ? (
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={completedDone || busy} onClick={() => update(o, { booking_status: "COMPLETED", payment_status: "PENDING" }, "completed")} className={`h-10 flex-1 rounded-xl text-sm font-semibold ${completedDone ? "bg-slate-100 text-slate-400" : "bg-amber-500 text-white"} disabled:cursor-not-allowed`}>
              {busy && busyKey === `${o.id}:completed` ? "…" : "Mark Completed"}
            </button>
            <button type="button" disabled={isPaid || busy} onClick={() => update(o, { payment_status: "PAID" }, "paid")} className={`h-10 flex-1 rounded-xl text-sm font-semibold ${isPaid ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white"} disabled:cursor-not-allowed`}>
              {busy && busyKey === `${o.id}:paid` ? "…" : "Mark Paid"}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Walk In Orders</h1>
        <p className="text-sm text-slate-500">Orders taken at the table by staff (waiter / cashier).</p>
      </div>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No walk-in orders yet.</div>
      ) : (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active · {active.length}</div>
          {active.length === 0 ? <div className="text-sm text-slate-500">No active walk-in orders.</div> : <div className="space-y-3">{active.map((o) => <Card key={o.id} o={o} />)}</div>}
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Completed / Paid · {closed.length}</div>
          {closed.length === 0 ? <div className="text-sm text-slate-500">Nothing here yet.</div> : <div className="space-y-3">{closed.map((o) => <Card key={o.id} o={o} />)}</div>}
        </>
      )}
    </div>
  );
}
