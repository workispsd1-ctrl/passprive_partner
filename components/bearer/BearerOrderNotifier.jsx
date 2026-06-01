"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";
import { Bell, CheckCircle2, X } from "lucide-react";

// Web Audio cues. soft = single short beep (awareness); loud = triple beep (action).
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
      osc.frequency.value = 820;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.start(t);
      osc.stop(t + 0.34);
      t += 0.42;
    }
  } catch {}
}

async function authedFetch(path, opts = {}) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return null;
  try {
    const res = await fetch(path, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch {
    return null;
  }
}

const ACTIVE = ["PLACED", "CONFIRMED", "PREPARING", "SERVED"];

export default function BearerOrderNotifier() {
  const [queue, setQueue] = useState([]); // [{id, tableNo, items, total, kind:'claim'|'new'|'ready'}]
  const seenRef = useRef(new Set());
  const prevStatusRef = useRef(new Map());
  const initRef = useRef(false);
  const ownerRef = useRef(new Map()); // table_no -> waiter_user_id
  const meRef = useRef("");

  const refreshOwners = useCallback(async () => {
    const asg = await authedFetch("/api/waiter/assignments");
    if (asg?.ok) {
      const m = new Map();
      (asg.assignments || []).forEach((a) => m.set(Number(a.table_no), a.waiter_user_id));
      ownerRef.current = m;
      meRef.current = String(asg.me || "");
    }
  }, []);

  const poll = useCallback(async () => {
    await refreshOwners();
    const json = await authedFetch("/api/kitchen/table-bookings");
    if (!json?.ok) return;
    const rows = (Array.isArray(json.orders) ? json.orders : []).filter((o) =>
      ACTIVE.includes(String(o.booking_status || "").toUpperCase())
    );

    // Seed on first pass so existing orders don't alert.
    if (!initRef.current) {
      rows.forEach((o) => {
        seenRef.current.add(String(o.id));
        prevStatusRef.current.set(String(o.id), String(o.booking_status || "").toUpperCase());
      });
      initRef.current = true;
      return;
    }

    const ownerMap = ownerRef.current;
    const meId = meRef.current;
    const newAlerts = [];

    for (const o of rows) {
      const id = String(o.id);
      const status = String(o.booking_status || "").toUpperCase();
      const prev = prevStatusRef.current.get(id);
      prevStatusRef.current.set(id, status);
      const owner = ownerMap.get(Number(o.table_no));
      const mineOrFree = !owner || owner === meId;

      // New order → awareness (soft); unclaimed offers Take Table.
      if (!seenRef.current.has(id)) {
        seenRef.current.add(id);
        if (mineOrFree) {
          newAlerts.push({
            id,
            tableNo: o.table_no ?? "—",
            items: Array.isArray(o.order_items) ? o.order_items : [],
            total: Number(o.total_amount || 0),
            kind: owner ? "new" : "claim",
          });
        }
        continue;
      }
      // → SERVED transition = food ready to run (loud); owner or unclaimed.
      if (status === "SERVED" && prev && prev !== "SERVED" && mineOrFree) {
        newAlerts.push({
          id,
          tableNo: o.table_no ?? "—",
          items: Array.isArray(o.order_items) ? o.order_items : [],
          total: Number(o.total_amount || 0),
          kind: "ready",
        });
      }
    }

    if (newAlerts.length === 0) return;
    const hasReady = newAlerts.some((a) => a.kind === "ready");
    beep(hasReady ? 3 : 1);
    setQueue((q) => [...q, ...newAlerts]);
  }, [refreshOwners]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  const dismiss = () => setQueue((q) => q.slice(1));

  const takeTable = async (tableNo) => {
    const n = Number(tableNo);
    if (n > 0) {
      const json = await authedFetch("/api/waiter/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", table_no: n }),
      });
      if (json?.ok) {
        toast.success(`You took Table ${n}.`);
        ownerRef.current.set(n, meRef.current || "me");
        window.dispatchEvent(new CustomEvent("bearer:refresh"));
      } else {
        toast.error(json?.error || "Failed to take table.");
      }
    }
    dismiss();
  };

  const top = queue[0];
  if (!top) return null;

  const isReady = top.kind === "ready";
  const isClaim = top.kind === "claim";

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-[#771FA8]/30 bg-[#F4E7D1] p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${isReady ? "border-emerald-300 bg-emerald-100" : "border-[#771FA8]/25 bg-[#771FA8]/10"}`}>
            {isReady ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Bell className="h-5 w-5 text-[#771FA8]" />}
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold text-[#3B0764]">{isReady ? "Ready to Serve!" : "New Order"}</div>
            <div className="text-sm text-[#7C3AED]">Table {top.tableNo}</div>
          </div>
          {queue.length > 1 ? <span className="rounded-lg bg-[#771FA8]/10 px-2 py-1 text-xs font-semibold text-[#6B21A8]">+{queue.length - 1}</span> : null}
        </div>

        {top.items.length > 0 ? (
          <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-[#771FA8]/15 bg-white/70 divide-y divide-[#771FA8]/10">
            {top.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-right font-semibold text-[#6B21A8]">{Number(it.qty ?? it.quantity ?? 1)}×</span>
                <span className="flex-1 truncate text-slate-800">{it.name || it.item_name || "Item"}</span>
              </div>
            ))}
          </div>
        ) : null}

        {isClaim ? (
          <div className="flex gap-2">
            <button type="button" onClick={dismiss} className="h-11 rounded-xl border border-[#771FA8]/30 bg-white/60 px-4 text-sm font-semibold text-[#6B21A8]">Dismiss</button>
            <button type="button" onClick={() => takeTable(top.tableNo)} className="h-11 flex-1 rounded-xl bg-[#6B21A8] text-sm font-semibold text-white">Take Table {top.tableNo}</button>
          </div>
        ) : (
          <button type="button" onClick={dismiss} className="h-11 w-full rounded-xl bg-[#6B21A8] text-sm font-semibold text-white">Ok, Got It</button>
        )}
      </div>
    </div>
  );
}
