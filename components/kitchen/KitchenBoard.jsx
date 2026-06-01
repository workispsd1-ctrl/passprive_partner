"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";
import { Clock, Flame, CheckCircle2, RotateCcw } from "lucide-react";

const AGE_AMBER_MIN = 6;
const AGE_RED_MIN = 12;

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
function leftBorder(mins, ready) {
  if (ready) return "border-l-emerald-500";
  if (mins >= AGE_RED_MIN) return "border-l-rose-500";
  if (mins >= AGE_AMBER_MIN) return "border-l-amber-500";
  return "border-l-emerald-500";
}
function prettyAge(mins) {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function itemsOf(order, key = "order_items") {
  const raw =
    (Array.isArray(order?.[key]) && order[key].length && order[key]) ||
    (Array.isArray(order?.order_details?.items) && order.order_details.items) ||
    (Array.isArray(order?.items) && order.items) ||
    [];
  return raw.map((it) => ({ name: String(it?.name || it?.item_name || "Item"), qty: Number(it?.qty ?? it?.quantity ?? 1) }));
}
function isStaffPlaced(o) {
  const src = String(o?.source || "").toLowerCase();
  if (["cashier", "staff_pad", "bearer_platform", "staff"].includes(src)) return true;
  const od = o?.order_details || {};
  return od.source_channel === "cashier_orders" || od.created_by === "cashier" || od.placed_by === "staff_pad" || od.is_staff_initiated === true;
}

function beep(times = 1) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 760;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.42);
      t += 0.5;
    }
  } catch {}
}

async function authedFetch(path, opts = {}) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
  return res.json();
}

// Lane definitions per board.
const TABLE_LANES = [
  { key: "NEW", label: "New", status: "PLACED", color: "#F59E0B" },
  { key: "ACCEPTED", label: "Accepted", status: "CONFIRMED", color: "#3B82F6" },
  { key: "PREPARING", label: "Preparing", status: "PREPARING", color: "#8B5CF6" },
  { key: "READY", label: "Ready", status: "SERVED", color: "#10B981" },
];
const TABLE_NEXT = { NEW: { label: "Acknowledge", to: "CONFIRMED" }, ACCEPTED: { label: "Start Preparing", to: "PREPARING" }, PREPARING: { label: "Mark Prepared", to: "SERVED" }, READY: null };
const TABLE_BACK = { ACCEPTED: "PLACED", PREPARING: "CONFIRMED", READY: "PREPARING" };
const TABLE_ACTIVE = ["PLACED", "CONFIRMED", "PREPARING", "SERVED"];
function tableLane(s) {
  const v = String(s || "").toUpperCase();
  return v === "PLACED" ? "NEW" : v === "CONFIRMED" ? "ACCEPTED" : v === "PREPARING" ? "PREPARING" : v === "SERVED" ? "READY" : null;
}

const PICKUP_LANES = [
  { key: "NEW", label: "New", status: "NEW", color: "#F59E0B" },
  { key: "ACCEPTED", label: "Accepted", status: "ACCEPTED", color: "#3B82F6" },
  { key: "PREPARING", label: "Preparing", status: "PREPARING", color: "#8B5CF6" },
  { key: "READY", label: "Ready", status: "READY_FOR_PICKUP", color: "#10B981" },
];
const PICKUP_NEXT = { NEW: { label: "Acknowledge", to: "ACCEPTED" }, ACCEPTED: { label: "Start Preparing", to: "PREPARING" }, PREPARING: { label: "Mark Ready", to: "READY_FOR_PICKUP" }, READY: null };
const PICKUP_BACK = { ACCEPTED: "NEW", PREPARING: "ACCEPTED", READY: "PREPARING" };
const PICKUP_ACTIVE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"];
function pickupLane(s) {
  const v = String(s || "").toUpperCase();
  return v === "NEW" ? "NEW" : v === "ACCEPTED" ? "ACCEPTED" : v === "PREPARING" ? "PREPARING" : v === "READY_FOR_PICKUP" ? "READY" : null;
}

export default function KitchenBoard() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [board, setBoard] = useState("tables"); // tables | pickup
  const [lane, setLane] = useState("NEW");
  const [busyId, setBusyId] = useState("");
  const [, setTick] = useState(0);
  const seenRef = useRef(new Set());
  const initRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        authedFetch("/api/kitchen/table-bookings").catch(() => null),
        authedFetch("/api/kitchen/pickup-orders").catch(() => null),
      ]);
      const tRows = tRes?.ok ? (tRes.orders || []).filter((o) => TABLE_ACTIVE.includes(String(o.booking_status || "").toUpperCase())) : [];
      const pRows = pRes?.ok ? (pRes.orders || []).filter((o) => PICKUP_ACTIVE.includes(String(o.order_status || "").toUpperCase())) : [];

      // New-order buzzer (kitchen cooks everything — table + takeaway).
      const ids = [...tRows.map((o) => `t:${o.id}`), ...pRows.map((o) => `p:${o.id}`)];
      if (!initRef.current) {
        ids.forEach((id) => seenRef.current.add(id));
        initRef.current = true;
      } else {
        const fresh = ids.filter((id) => !seenRef.current.has(id));
        ids.forEach((id) => seenRef.current.add(id));
        if (fresh.length > 0) beep(2);
      }

      setOrders(tRows);
      setPickups(pRows);
    } catch (e) {
      if (!silent) toast.error(e?.message || "Failed to load kitchen orders.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 5000);
    const timer = setInterval(() => setTick((n) => n + 1), 15000);
    const onRefresh = () => load(true);
    window.addEventListener("kitchen:refresh", onRefresh);
    return () => { clearInterval(poll); clearInterval(timer); window.removeEventListener("kitchen:refresh", onRefresh); };
  }, [load]);

  const advance = async (o, to, key, isPickup) => {
    if (busyId) return;
    setBusyId(`${o.id}:${key}`);
    try {
      const json = isPickup
        ? await authedFetch("/api/kitchen/pickup-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: o.id, order_status: to }) })
        : await authedFetch("/api/kitchen/table-bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: o.id, booking_status: to }) });
      if (!json?.ok) throw new Error(json?.error || "Failed");
      await load(true);
    } catch (e) {
      toast.error(e?.message || "Failed to update.");
    } finally {
      setBusyId("");
    }
  };

  const lanes = board === "tables" ? TABLE_LANES : PICKUP_LANES;
  const laneOf = board === "tables" ? tableLane : pickupLane;
  const nextMap = board === "tables" ? TABLE_NEXT : PICKUP_NEXT;
  const backMap = board === "tables" ? TABLE_BACK : PICKUP_BACK;
  const statusKey = board === "tables" ? "booking_status" : "order_status";
  const list = board === "tables" ? orders : pickups;

  const counts = useMemo(() => {
    const c = { NEW: 0, ACCEPTED: 0, PREPARING: 0, READY: 0 };
    for (const o of list) { const l = laneOf(o[statusKey]); if (l) c[l] += 1; }
    return c;
  }, [list, board]);

  const laneList = useMemo(
    () => list.filter((o) => laneOf(o[statusKey]) === lane).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
    [list, lane, board]
  );

  const oldest = useMemo(() => {
    const cooking = orders.filter((o) => ["PLACED", "CONFIRMED", "PREPARING"].includes(String(o.booking_status || "").toUpperCase()));
    return cooking.reduce((m, o) => Math.max(m, minutesSince(o.created_at)), 0);
  }, [orders]);

  const Ticket = ({ o, isPickup }) => {
    const l = laneOf(o[statusKey]);
    const items = itemsOf(o, isPickup ? "items" : "order_items");
    const mins = minutesSince(o.created_at);
    const action = nextMap[l];
    const back = backMap[l];
    const busy = busyId.startsWith(`${o.id}:`);
    const laneColor = lanes.find((x) => x.key === l)?.color || "#771FA8";
    return (
      <div className={`rounded-2xl border bg-white p-4 shadow-sm border-l-4 ${leftBorder(mins, l === "READY")}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 min-w-12 items-center justify-center rounded-xl px-2 text-sm font-bold" style={{ background: isPickup ? "#F59E0B18" : "#771FA814", color: isPickup ? "#B45309" : "#771FA8" }}>
              {isPickup ? (o.pickup_code || "PICK") : (Number(o.table_no) > 0 ? `T${o.table_no}` : "—")}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">{isPickup ? (o.order_number || `#${String(o.id).slice(0, 6).toUpperCase()}`) : `#${String(o.id).slice(0, 6).toUpperCase()}`}</div>
              <div className="text-[11px] text-slate-500">{isPickup ? "Takeaway" : isStaffPlaced(o) ? "Walk-in" : "QR"}{o.customer_name ? ` · ${o.customer_name}` : ""}</div>
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
                <span className="min-w-8 text-base font-bold text-[#771FA8]">{it.qty}×</span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{it.name}</span>
              </div>
            ))
          )}
        </div>

        {o.notes ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Note: {o.notes}</div> : null}

        <div className="mt-3 flex items-center gap-2">
          {action ? (
            <button type="button" disabled={busy} onClick={() => advance(o, action.to, "next", isPickup)} className="h-11 flex-1 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: laneColor }}>
              {busy && busyId === `${o.id}:next` ? "…" : action.label}
            </button>
          ) : (
            <div className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {isPickup ? "Ready for pickup" : "Ready · waiter notified"}
            </div>
          )}
          {back ? (
            <button type="button" disabled={busy} onClick={() => advance(o, back, "recall", isPickup)} title="Recall" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60">
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Kitchen Display</h1>
      </div>

      {/* Board toggle */}
      <div className="flex gap-2">
        {[
          { key: "tables", label: "Tables", count: counts.NEW + counts.ACCEPTED + counts.PREPARING + counts.READY, total: orders.length },
          { key: "pickup", label: "Takeaway", count: pickups.length, total: pickups.length },
        ].map((b) => {
          const active = board === b.key;
          const c = b.key === "tables" ? orders.length : pickups.length;
          return (
            <button key={b.key} type="button" onClick={() => { setBoard(b.key); setLane("NEW"); }} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${active ? "border-[#771FA8] bg-[#771FA8] text-white" : "border-slate-200 bg-white text-slate-700"}`}>
              {b.label}
              <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${active ? "bg-white/25 text-white" : "bg-[#771FA8]/10 text-[#771FA8]"}`}>{c}</span>
            </button>
          );
        })}
      </div>

      {/* KPI strip (tables) */}
      {board === "tables" ? (
        <div className="flex items-center justify-around rounded-2xl border border-slate-200 bg-white py-3">
          <div className="flex items-center gap-1.5"><Flame className="h-4 w-4 text-amber-500" /><span className="font-bold text-slate-900">{counts.NEW + counts.ACCEPTED + counts.PREPARING}</span><span className="text-xs text-slate-500">Cooking</span></div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="font-bold text-slate-900">{counts.READY}</span><span className="text-xs text-slate-500">Ready</span></div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5"><Clock className={`h-4 w-4 ${oldest >= AGE_RED_MIN ? "text-rose-500" : oldest >= AGE_AMBER_MIN ? "text-amber-500" : "text-emerald-500"}`} /><span className="font-bold text-slate-900">{prettyAge(oldest)}</span><span className="text-xs text-slate-500">Oldest</span></div>
        </div>
      ) : null}

      {/* Lane tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {lanes.map((l) => {
          const active = lane === l.key;
          return (
            <button key={l.key} type="button" onClick={() => setLane(l.key)} className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap" style={active ? { background: l.color, borderColor: l.color, color: "#fff" } : { background: "#fff", borderColor: "#e2e8f0", color: "#334155" }}>
              {l.label}
              <span className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold" style={active ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: `${l.color}18`, color: l.color }}>{counts[l.key]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
      ) : laneList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No {lanes.find((l) => l.key === lane)?.label.toLowerCase()} {board === "pickup" ? "takeaway " : ""}orders.
        </div>
      ) : (
        <div className="space-y-3">{laneList.map((o) => <Ticket key={o.id} o={o} isPickup={board === "pickup"} />)}</div>
      )}
    </div>
  );
}
