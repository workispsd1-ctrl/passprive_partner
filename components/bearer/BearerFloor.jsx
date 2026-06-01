"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";
import { Clock, ChefHat } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
const AGE_AMBER_MIN = 5;
const AGE_RED_MIN = 10;

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function minutesSince(iso) {
  const t = new Date(iso || "").getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}
function ageClass(mins) {
  if (mins >= AGE_RED_MIN) return "text-rose-600 bg-rose-50 border-rose-200";
  if (mins >= AGE_AMBER_MIN) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-emerald-600 bg-emerald-50 border-emerald-200";
}
function prettyAge(mins) {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function progressLabel(s) {
  const v = String(s || "").toUpperCase();
  if (v === "PLACED") return "Placed";
  if (v === "CONFIRMED") return "Acknowledged";
  if (v === "PREPARING") return "Preparing";
  if (v === "SERVED") return "Ready";
  return v;
}
function extractItems(order) {
  const raw =
    (Array.isArray(order?.order_items) && order.order_items.length && order.order_items) ||
    (Array.isArray(order?.order_details?.items) && order.order_details.items) ||
    [];
  return raw.map((it) => ({
    name: String(it?.name || it?.item_name || "Item"),
    qty: Number(it?.qty ?? it?.quantity ?? 1),
  }));
}

const NEW_STATUSES = ["PLACED"];
const PROGRESS_STATUSES = ["CONFIRMED", "PREPARING"];

async function authedFetch(path, opts = {}) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
  return res.json();
}

const TABS = [
  { key: "READY", label: "Ready to Run", color: "emerald" },
  { key: "NEW", label: "New", color: "amber" },
  { key: "PROGRESS", label: "In Progress", color: "violet" },
  { key: "FLOOR", label: "Floor", color: "slate" },
];

export default function BearerFloor() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [me, setMe] = useState("");
  const [tab, setTab] = useState("READY");
  const [scope, setScope] = useState("mine"); // mine | all
  const [busyId, setBusyId] = useState("");
  const [, setTick] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const json = await authedFetch("/api/kitchen/table-bookings");
      if (json?.ok) {
        const rows = Array.isArray(json.orders) ? json.orders : [];
        setOrders(
          rows.filter((o) => {
            const s = String(o.booking_status || "").toUpperCase();
            const p = String(o.payment_status || "").toUpperCase();
            if (["CANCELLED", "PAID"].includes(s) || p === "PAID") return false;
            return ["PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED"].includes(s);
          })
        );
      }
      const asg = await authedFetch("/api/waiter/assignments").catch(() => null);
      if (asg?.ok) {
        setAssignments(Array.isArray(asg.assignments) ? asg.assignments : []);
        setMe(String(asg.me || ""));
      }
      // Tables come bundled with the cashier table-layout (service role) — reuse it.
      const lay = await authedFetch("/api/cashier/table-layout").catch(() => null);
      if (lay?.ok && Array.isArray(lay.tables)) setTables(lay.tables);
    } catch (e) {
      if (!silent) toast.error(e?.message || "Failed to load floor.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 5000);
    const timer = setInterval(() => setTick((n) => n + 1), 15000);
    const onRefresh = () => load(true);
    window.addEventListener("bearer:refresh", onRefresh);
    return () => {
      clearInterval(poll);
      clearInterval(timer);
      window.removeEventListener("bearer:refresh", onRefresh);
    };
  }, [load]);

  // ── ownership helpers ────────────────────────────────────────────────────────
  const ownerByTable = useMemo(() => {
    const m = new Map();
    for (const a of assignments) m.set(Number(a.table_no), a);
    return m;
  }, [assignments]);
  const ownerOf = (tableNo) => ownerByTable.get(Number(tableNo)) || null;
  const isMine = (tableNo) => {
    const o = ownerByTable.get(Number(tableNo));
    return Boolean(o && me && o.waiter_user_id === me);
  };
  const isUnclaimed = (tableNo) => !ownerByTable.has(Number(tableNo));
  const inScope = (tableNo) => (scope === "all" ? true : isMine(tableNo) || isUnclaimed(tableNo));

  // ── actions ────────────────────────────────────────────────────────────────
  const markServed = async (order) => {
    if (busyId) return;
    setBusyId(order.id);
    try {
      const json = await authedFetch("/api/kitchen/table-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: order.id, booking_status: "COMPLETED" }),
      });
      if (!json?.ok) throw new Error(json?.error || "Failed");
      await load(true);
    } catch (e) {
      toast.error(e?.message || "Failed to update.");
    } finally {
      setBusyId("");
    }
  };
  const claim = async (tableNo) => {
    if (busyId) return;
    setBusyId(`claim-${tableNo}`);
    try {
      const json = await authedFetch("/api/waiter/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", table_no: Number(tableNo) }),
      });
      if (!json?.ok) throw new Error(json?.error || "Table already taken.");
      toast.success(`You took Table ${tableNo}.`);
      await load(true);
    } catch (e) {
      toast.error(e?.message || "Failed to take table.");
      await load(true);
    } finally {
      setBusyId("");
    }
  };
  const release = async (tableNo) => {
    if (busyId) return;
    setBusyId(`rel-${tableNo}`);
    try {
      const json = await authedFetch("/api/waiter/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", table_no: Number(tableNo) }),
      });
      if (!json?.ok) throw new Error(json?.error || "Failed");
      toast.success(`Released Table ${tableNo}.`);
      await load(true);
    } catch (e) {
      toast.error(e?.message || "Failed to release.");
    } finally {
      setBusyId("");
    }
  };

  // ── lane lists ───────────────────────────────────────────────────────────────
  const ready = useMemo(
    () => orders.filter((o) => String(o.booking_status).toUpperCase() === "SERVED" && inScope(o.table_no)),
    [orders, scope, ownerByTable, me]
  );
  const fresh = useMemo(
    () => orders.filter((o) => NEW_STATUSES.includes(String(o.booking_status).toUpperCase()) && inScope(o.table_no)),
    [orders, scope, ownerByTable, me]
  );
  const progress = useMemo(
    () => orders.filter((o) => PROGRESS_STATUSES.includes(String(o.booking_status).toUpperCase()) && inScope(o.table_no)),
    [orders, scope, ownerByTable, me]
  );

  const floorTables = useMemo(() => {
    const statusByTable = new Map();
    for (const o of orders) {
      const tn = Number(o.table_no || 0);
      if (!tn) continue;
      const s = String(o.booking_status || "").toUpperCase();
      const cur = statusByTable.get(tn);
      if (s === "SERVED") statusByTable.set(tn, "ready");
      else if (cur !== "ready") statusByTable.set(tn, "active");
    }
    const base = tables.map((r) => Number(r.table_no || 0)).filter((n) => n > 0);
    const fromOrders = orders.map((o) => Number(o.table_no || 0)).filter((n) => n > 0);
    const all = Array.from(new Set([...base, ...fromOrders])).sort((a, b) => a - b);
    return all.map((tableNo) => {
      const row = tables.find((r) => Number(r.table_no) === tableNo);
      return { tableNo, label: row?.label || `T${tableNo}`, status: statusByTable.get(tableNo) || "free" };
    });
  }, [tables, orders]);

  const counts = {
    READY: ready.length,
    NEW: fresh.length,
    PROGRESS: progress.length,
    FLOOR: floorTables.filter((f) => f.status !== "free").length,
  };

  // ── ticket card ────────────────────────────────────────────────────────────
  const Ticket = ({ o, isReady }) => {
    const items = extractItems(o);
    const mins = minutesSince(isReady ? o.updated_at || o.created_at : o.created_at);
    const mine = isMine(o.table_no);
    const unclaimed = isUnclaimed(o.table_no);
    const owner = ownerOf(o.table_no);
    const busy = busyId === o.id;
    const claimBusy = busyId === `claim-${o.table_no}`;
    return (
      <div className={`rounded-2xl border bg-white p-4 shadow-sm border-l-4 ${isReady ? "border-l-emerald-500" : mins >= AGE_RED_MIN ? "border-l-rose-500" : mins >= AGE_AMBER_MIN ? "border-l-amber-500" : "border-l-emerald-500"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#771FA8]/10 px-2 text-sm font-bold text-[#771FA8]">
              {Number(o.table_no) > 0 ? `T${o.table_no}` : "—"}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 6).toUpperCase()}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isReady ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-violet-300 bg-violet-50 text-violet-700"}`}>
                  {isReady ? "Ready" : progressLabel(o.booking_status)}
                </span>
                {mine ? (
                  <span className="rounded-full border border-[#771FA8]/40 bg-[#771FA8]/10 px-2 py-0.5 text-[10px] font-semibold text-[#771FA8]">Mine</span>
                ) : unclaimed ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Unclaimed</span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{owner?.waiter_name || "Taken"}</span>
                )}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${ageClass(mins)}`}>
            <Clock className="h-3 w-3" /> {prettyAge(mins)}
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No item details</div>
          ) : (
            items.map((it, idx) => (
              <div key={idx} className={`flex items-center gap-3 px-3 py-2 ${idx > 0 ? "border-t border-slate-100" : ""}`}>
                <span className="min-w-7 text-sm font-bold text-[#771FA8]">{it.qty}×</span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{it.name}</span>
              </div>
            ))
          )}
        </div>

        {o.notes ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Note: {o.notes}</div>
        ) : null}

        <div className="mt-3">
          {unclaimed ? (
            <button type="button" disabled={claimBusy} onClick={() => claim(o.table_no)} className="h-11 w-full rounded-xl bg-[#771FA8] text-sm font-semibold text-white disabled:opacity-60">
              {claimBusy ? "Taking…" : `Take Table ${o.table_no}`}
            </button>
          ) : !mine ? (
            <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3 text-sm text-slate-500">
              <span>Served by {owner?.waiter_name || "another waiter"}</span>
              <span className="font-semibold text-slate-800">{money(o.total_amount)}</span>
            </div>
          ) : isReady ? (
            <button type="button" disabled={busy} onClick={() => markServed(o)} className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Updating…" : "Mark Served"}
            </button>
          ) : (
            <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><ChefHat className="h-4 w-4" /> In the kitchen</span>
              <span className="font-semibold text-slate-800">{money(o.total_amount)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const laneList = tab === "READY" ? ready : tab === "NEW" ? fresh : tab === "PROGRESS" ? progress : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My Floor</h1>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {["mine", "all"].map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${scope === s ? "bg-[#771FA8] text-white" : "text-slate-600"}`}>
              {s === "mine" ? "My tables" : "All tables"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button key={tb.key} type="button" onClick={() => setTab(tb.key)} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap ${active ? "border-[#771FA8] bg-[#771FA8] text-white" : "border-slate-200 bg-white text-slate-700"}`}>
              {tb.label}
              <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"}`}>{counts[tb.key]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : tab === "FLOOR" ? (
        floorTables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No tables configured.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {floorTables.map((ft) => {
              const ready = ft.status === "ready";
              const active = ft.status === "active";
              const mine = isMine(ft.tableNo);
              const owner = ownerOf(ft.tableNo);
              return (
                <div key={ft.tableNo} className={`rounded-2xl border-2 p-4 ${ready ? "border-emerald-500 bg-emerald-50" : active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <div className="text-lg font-bold text-slate-900">{ft.label}</div>
                  <div className={`text-xs font-semibold ${ready ? "text-emerald-700" : active ? "text-blue-700" : "text-slate-500"}`}>{ready ? "Food ready" : active ? "Active" : "Free"}</div>
                  {owner ? <div className={`mt-1 text-[11px] font-semibold ${mine ? "text-[#771FA8]" : "text-slate-500"}`}>{mine ? "★ Mine" : owner.waiter_name}</div> : null}
                  {mine ? (
                    <button type="button" onClick={() => release(ft.tableNo)} className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600">Release</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : laneList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {tab === "READY" ? "Nothing to run right now." : tab === "NEW" ? "No new orders." : "No orders in the kitchen."}
        </div>
      ) : (
        <div className="space-y-3">
          {laneList.map((o) => <Ticket key={o.id} o={o} isReady={tab === "READY"} />)}
        </div>
      )}
    </div>
  );
}
