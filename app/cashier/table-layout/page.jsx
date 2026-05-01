"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Ban } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

const BLOCK_KEY_PREFIX = "cashier_blocked_tables_";
const JOIN_KEY_PREFIX = "cashier_joined_tables_";
const JOIN_SNAP_THRESHOLD_PX = 180;

function sizeForShape(shape) {
  if (shape === "circle") return { w: 132, h: 132 };
  if (shape === "rectangle") return { w: 186, h: 114 };
  return { w: 148, h: 148 };
}

function statusActive(status, payment) {
  const s = String(status || "").toUpperCase();
  const p = String(payment || "").toUpperCase();
  if (["CANCELLED", "PAID", "COMPLETED", "SERVED"].includes(s)) return false;
  if (["PAID", "COMPLETED"].includes(p)) return false;
  return true;
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CashierTableLayoutPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [blocked, setBlocked] = useState({});
  const [joinedMap, setJoinedMap] = useState({});
  const [detailTableNo, setDetailTableNo] = useState(null);
  const [dragTableNo, setDragTableNo] = useState(null);
  const [dragOverTableNo, setDragOverTableNo] = useState(null);

  const activeByTable = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const t = Number(o?.table_no || 0);
      if (!Number.isInteger(t) || t <= 0) continue;
      if (!statusActive(o?.booking_status, o?.payment_status)) continue;
      const curr = map.get(t) || { count: 0, total: 0 };
      curr.count += 1;
      curr.total += Number(o?.total_amount || 0);
      map.set(t, curr);
    }
    return map;
  }, [orders]);

  const visibleTables = useMemo(() => {
    return tables.filter((t) => {
      const sourceNo = Number(t?.table_no || 0);
      const targetNo = Number(joinedMap[String(sourceNo)] || 0);
      if (!targetNo) return true;
      return false;
    });
  }, [tables, joinedMap]);

  const detailOrders = useMemo(() => {
    if (!detailTableNo) return [];
    return orders.filter((o) => Number(o.table_no) === Number(detailTableNo));
  }, [orders, detailTableNo]);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/table-layout", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load table layout.");

      setRestaurantId(json?.restaurant_id || null);
      setTables(Array.isArray(json?.tables) ? json.tables : []);
      setOrders(Array.isArray(json?.orders) ? json.orders : []);

      const raw = window.localStorage.getItem(`${BLOCK_KEY_PREFIX}${json?.restaurant_id || ""}`);
      setBlocked(raw ? JSON.parse(raw) : {});
      const joinedRaw = window.localStorage.getItem(`${JOIN_KEY_PREFIX}${json?.restaurant_id || ""}`);
      setJoinedMap(joinedRaw ? JSON.parse(joinedRaw) : {});
    } catch (e) {
      toast.error(e?.message || "Failed to load cashier table layout.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const onTopRefresh = () => loadAll();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    window.localStorage.setItem(`${BLOCK_KEY_PREFIX}${restaurantId}`, JSON.stringify(blocked));
  }, [blocked, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    window.localStorage.setItem(`${JOIN_KEY_PREFIX}${restaurantId}`, JSON.stringify(joinedMap));
  }, [joinedMap, restaurantId]);

  useEffect(() => {
    const keys = Object.keys(joinedMap);
    if (!keys.length) return;
    const next = { ...joinedMap };
    let changed = false;
    for (const sourceNo of keys) {
      const targetNo = Number(joinedMap[sourceNo] || 0);
      if (!targetNo) continue;
      const targetActive = Number(activeByTable.get(targetNo)?.count || 0) > 0;
      if (!targetActive) {
        delete next[sourceNo];
        changed = true;
      }
    }
    if (changed) setJoinedMap(next);
  }, [activeByTable, joinedMap]);

  const setBlockedState = (tableNo, value) => {
    setBlocked((prev) => ({ ...prev, [String(tableNo)]: Boolean(value) }));
  };

  const moveCustomers = async (from, to, label = "Moved") => {
    const fromNo = Number(from);
    const toNo = Number(to);
    if (!fromNo || !toNo || fromNo === toNo) return;

    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/table-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "move_customers",
          from_table: fromNo,
          to_table: toNo,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to move customers.");

      toast.success(`${label}: ${Number(json?.moved_count || 0)} active order(s) from T${fromNo} to T${toNo}.`);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to move customers.");
    }
  };

  const onDropOnTable = async (targetTableNo, droppedSourceTableNo) => {
    const fromNo = Number(droppedSourceTableNo || dragTableNo || 0);
    const toNo = Number(targetTableNo || 0);
    setDragOverTableNo(null);
    if (!fromNo || !toNo || fromNo === toNo) return;

    if (blocked[String(toNo)]) {
      toast.error(`T${toNo} is blocked. Unblock it first.`);
      return;
    }

    const sourceCount = Number(activeByTable.get(fromNo)?.count || 0);

    const targetCount = Number(activeByTable.get(toNo)?.count || 0);
    if (sourceCount > 0) {
      if (targetCount > 0) {
        await moveCustomers(fromNo, toNo, "Joined tables");
      } else {
        await moveCustomers(fromNo, toNo, "Moved customers");
      }
    } else {
      toast.success(`Joined T${fromNo} with T${toNo}.`);
    }
    setJoinedMap((prev) => ({ ...prev, [String(fromNo)]: toNo }));
  };

  const onDropNearTable = async (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let sourceTableNo = null;
    try {
      const raw = e.dataTransfer.getData("text/plain");
      sourceTableNo = Number(raw || 0) || null;
    } catch {}
    const fromNo = Number(sourceTableNo || dragTableNo || 0);
    if (!fromNo) return;

    let nearestTableNo = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const t of tables) {
      const tableNo = Number(t.table_no || 0);
      if (!tableNo || tableNo === fromNo) continue;
      const cx = (Number(t.pos_x || 0) / 100) * rect.width;
      const cy = (Number(t.pos_y || 0) / 100) * rect.height;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTableNo = tableNo;
      }
    }

    if (nearestTableNo && nearestDist <= JOIN_SNAP_THRESHOLD_PX) {
      await onDropOnTable(nearestTableNo, fromNo);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
       

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="relative w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50" style={{ minHeight: 560 }}>
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`table-sk-${idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white"
                style={{
                  left: `${12 + (idx % 4) * 22}%`,
                  top: `${18 + Math.floor(idx / 4) * 34}%`,
                  width: 120,
                  height: 96,
                }}
              >
                <div className="mx-auto mt-6 h-4 w-12 rounded bg-slate-200" />
                <div className="mx-auto mt-2 h-3 w-16 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">Floor Map</div>
          <div
            className="relative w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50"
            style={{ minHeight: 560 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropNearTable}
          >
            {visibleTables.map((t) => {
              const tableNo = Number(t.table_no);
              const size = sizeForShape(t.shape);
              const active = activeByTable.has(tableNo);
              const blockedNow = Boolean(blocked[String(tableNo)]);
              const dragOver = dragOverTableNo === tableNo;
              const joinedSources = Object.keys(joinedMap).filter((k) => Number(joinedMap[k]) === tableNo).map((k) => Number(k));
              const isJoinHost = joinedSources.length > 0;
              const hostWidth = isJoinHost ? Math.round(size.w * 1.42) : size.w;
              const hostHeight = isJoinHost ? Math.round(size.h * 1.1) : size.h;
              return (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragTableNo(tableNo);
                    try {
                      e.dataTransfer.setData("text/plain", String(tableNo));
                      e.dataTransfer.effectAllowed = "move";
                    } catch {}
                  }}
                  onDragEnd={() => {
                    setDragTableNo(null);
                    setDragOverTableNo(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTableNo(tableNo);
                  }}
                  onDragLeave={() => setDragOverTableNo((prev) => (prev === tableNo ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    let sourceTableNo = null;
                    try {
                      const raw = e.dataTransfer.getData("text/plain");
                      sourceTableNo = Number(raw || 0) || null;
                    } catch {}
                    onDropOnTable(tableNo, sourceTableNo);
                  }}
                  onClick={() => setDetailTableNo(tableNo)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 shadow-sm ${dragOver ? "ring-4 ring-[#771FA8]/40" : ""} ${dragTableNo === tableNo ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{
                    left: `${Number(t.pos_x || 10)}%`,
                    top: `${Number(t.pos_y || 10)}%`,
                    width: hostWidth,
                    height: hostHeight,
                    background: blockedNow
                      ? "#e2e8f0"
                      : active
                        ? "linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)"
                        : "#ffffff",
                    borderColor: blockedNow ? "#64748b" : active ? "#16a34a" : "#d1d5db",
                  }}
                >
                  <div className="text-sm font-bold text-slate-900">T{tableNo}</div>
                  <div className="text-[11px] text-slate-600">
                    {active ? `${activeByTable.get(tableNo)?.count || 0} active` : blockedNow ? "Blocked" : "Available"}
                  </div>
                  {isJoinHost ? (
                    <div className="mt-1 inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Joined {joinedSources.map((n) => `T${n}`).join(" + ")}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

      {detailTableNo ? (
        <div className="fixed inset-0 z-50 bg-black/30 lg:left-64">
          <div className="h-full w-full overflow-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Table T{detailTableNo}</h2>
                  <p className="text-xs text-slate-500">Order details</p>
                </div>
                <button onClick={() => setDetailTableNo(null)} className="h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      const isBlocked = Boolean(blocked[String(detailTableNo)]);
                      setBlockedState(detailTableNo, !isBlocked);
                      toast.success(isBlocked ? `T${detailTableNo} unblocked.` : `T${detailTableNo} blocked.`);
                    }}
                    className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    {blocked[String(detailTableNo)] ? "Unblock Table" : "Block Table"}
                  </button>
                </div>
                {detailOrders.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">No orders on this table.</div>
                ) : (
                  <div className="space-y-3">
                    {detailOrders.map((o) => {
                      const items = Array.isArray(o?.order_items) ? o.order_items : [];
                      return (
                        <div key={o.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">Order #{String(o.id).slice(0, 8)}</div>
                            <div className="text-xs text-slate-600">{String(o.booking_status || "PLACED")} • {String(o.payment_status || "PENDING")}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">Customer: {o.customer_name || "Guest"} {o.customer_phone ? `(${o.customer_phone})` : ""}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {items.length ? items.map((it, idx) => (
                              <span key={`${o.id}-${idx}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                                {it?.name || "Item"} x {Number(it?.qty || 0)}
                              </span>
                            )) : <span className="text-xs text-slate-500">No item details</span>}
                          </div>
                          <div className="mt-3 text-sm font-semibold text-slate-900">Total: {money(o.total_amount)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
