"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Ban } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

const BLOCK_KEY_PREFIX = "cashier_blocked_tables_";
const JOIN_KEY_PREFIX = "cashier_joined_tables_";
const JOIN_SNAP_THRESHOLD_PX = 90;

function sizeForShape(shape) {
  if (shape === "circle") return { w: 132, h: 132 };
  if (shape === "rectangle") return { w: 186, h: 114 };
  return { w: 148, h: 148 };
}

function statusActive(status, payment) {
  const s = String(status || "").toUpperCase();
  const p = String(payment || "").toUpperCase();
  if (["CANCELLED"].includes(s)) return false;
  if (["PAID", "COMPLETED"].includes(p)) return false;
  return true;
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extractOrderItems(order) {
  if (Array.isArray(order?.order_items) && order.order_items.length) return order.order_items;
  const details = order?.order_details;
  if (details && typeof details === "object") {
    if (Array.isArray(details.items) && details.items.length) return details.items;
    if (Array.isArray(details.order_items) && details.order_items.length) return details.order_items;
    if (details.order_snapshot && typeof details.order_snapshot === "object") {
      if (Array.isArray(details.order_snapshot.items) && details.order_snapshot.items.length) return details.order_snapshot.items;
      if (Array.isArray(details.order_snapshot.order_items) && details.order_snapshot.order_items.length) return details.order_snapshot.order_items;
    }
  }
  return [];
}

function extractCustomer(order) {
  const details = order?.order_details && typeof order.order_details === "object" ? order.order_details : {};
  const snapshot = details?.order_snapshot && typeof details.order_snapshot === "object" ? details.order_snapshot : {};
  return {
    name: order?.customer_name || details?.customer_name || snapshot?.customer_name || "Guest",
    phone: order?.customer_phone || details?.customer_phone || snapshot?.customer_phone || "",
  };
}

export default function CashierTableLayoutPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [blocked, setBlocked] = useState({});
  const [joinedMap, setJoinedMap] = useState({});
  const [detailTableNo, setDetailTableNo] = useState(null);
  const [dragTableNo, setDragTableNo] = useState(null);
  const [dragOverTableNo, setDragOverTableNo] = useState(null);
  const [updatingOrderKey, setUpdatingOrderKey] = useState("");
  const dragDropHandledRef = useRef(false);
  const lastCanvasPointRef = useRef(null);

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

  const getJoinEntry = (tableNo) => joinedMap[String(tableNo)] || null;
  const getJoinedSources = (targetNo) =>
    Object.keys(joinedMap)
      .filter((k) => Number(joinedMap[k]?.target || 0) === Number(targetNo))
      .map((k) => Number(k));
  const resolveJoinHost = (tableNo) => {
    let current = Number(tableNo || 0);
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = Number(joinedMap[String(current)]?.target || 0);
      if (!next) return current;
      current = next;
    }
    return Number(tableNo || 0);
  };

  const detailOrders = useMemo(() => {
    if (!detailTableNo) return [];
    return orders.filter((o) => Number(o.table_no) === Number(detailTableNo));
  }, [orders, detailTableNo]);

  const detailActiveOrders = useMemo(
    () => detailOrders.filter((o) => statusActive(o?.booking_status, o?.payment_status)),
    [detailOrders]
  );

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
      const parsed = joinedRaw ? JSON.parse(joinedRaw) : {};
      setJoinedMap(parsed && typeof parsed === "object" ? parsed : {});
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
    const keys = Object.keys(joinedMap || {});
    if (!keys.length) return;
    const next = { ...joinedMap };
    let changed = false;
    for (const sourceNo of keys) {
      const entry = joinedMap[sourceNo];
      const targetNo = Number(entry?.target || 0);
      if (!targetNo) continue;
      const resetOnInactive = Boolean(entry?.reset_on_inactive);
      if (!resetOnInactive) continue;
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

  const updateOrderState = async (orderId, patch, actionKey) => {
    const lockKey = `${orderId}:${actionKey || "update"}`;
    if (updatingOrderKey) return;
    setUpdatingOrderKey(lockKey);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/cashier/table-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "update_order_state", order_id: orderId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update order state.");
      toast.success("Order updated.");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to update order.");
    } finally {
      setUpdatingOrderKey("");
    }
  };

  const cancelOrderItem = async (orderId, item) => {
    const itemKey = String(item?.item_id || item?.id || item?.name || "").trim();
    if (!orderId || !itemKey) return;

    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/table-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "cancel_item",
          order_id: orderId,
          item_key: itemKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to cancel item.");

      toast.success(`Removed ${item?.name || "item"} from order.`);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to cancel item.");
    }
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
    const sourceNo = Number(droppedSourceTableNo || dragTableNo || 0);
    const fromNo = resolveJoinHost(sourceNo);
    const toNo = resolveJoinHost(Number(targetTableNo || 0));
    setDragOverTableNo(null);
    if (!fromNo || !toNo || fromNo === toNo) return;

    if (blocked[String(toNo)]) {
      toast.error(`T${toNo} is blocked. Unblock it first.`);
      return;
    }

    const sourceCount = Number(activeByTable.get(fromNo)?.count || 0);
    const targetCount = Number(activeByTable.get(toNo)?.count || 0);
    const sourceActive = sourceCount > 0;
    const targetActive = targetCount > 0;

    // Rule:
    // active -> inactive = move
    // active -> active = join
    // inactive -> inactive = join
    if (sourceActive && !targetActive) {
      await moveCustomers(fromNo, toNo, "Moved customers");
      setJoinedMap((prev) => {
        const next = { ...prev };
        delete next[String(fromNo)];
        return next;
      });
      return;
    }

    const sourceTable = tables.find((t) => Number(t.table_no) === fromNo);
    setJoinedMap((prev) => ({
      ...prev,
      [String(fromNo)]: {
        target: toNo,
        original_pos_x: Number(sourceTable?.pos_x || 10),
        original_pos_y: Number(sourceTable?.pos_y || 10),
        reset_on_inactive: Boolean(sourceActive || targetActive),
      },
    }));
    toast.success(`Joined T${fromNo} with T${toNo}.`);
  };

  const onDropNearTable = async (e) => {
    e.preventDefault();
    dragDropHandledRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let sourceTableNo = null;
    try {
      const raw = e.dataTransfer.getData("text/plain");
      sourceTableNo = Number(raw || 0) || null;
    } catch {}
    const sourceNo = Number(sourceTableNo || dragTableNo || 0);
    if (!sourceNo) return;
    const fromNo = resolveJoinHost(sourceNo);

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

    const rawJoinEntry = getJoinEntry(fromNo);
    const joinEntry = rawJoinEntry || getJoinEntry(sourceNo);
    const hostJoinedSources = getJoinedSources(sourceNo);

    const unjoinTableByNo = (tableNoToUnjoin) => {
      const entry = getJoinEntry(tableNoToUnjoin);
      const nextX = Math.max(
        4,
        Math.min(96, Number(entry?.original_pos_x ?? (x / rect.width) * 100))
      );
      const nextY = Math.max(
        6,
        Math.min(94, Number(entry?.original_pos_y ?? (y / rect.height) * 100))
      );
      setTables((prev) =>
        prev.map((t) =>
          Number(t.table_no) === Number(tableNoToUnjoin) ? { ...t, pos_x: nextX, pos_y: nextY } : t
        )
      );
      setJoinedMap((prev) => {
        const next = { ...prev };
        delete next[String(tableNoToUnjoin)];
        return next;
      });
      toast.success(`Unjoined T${tableNoToUnjoin}.`);
    };

    // If this is already a joined child, dropping on floor should unjoin in one action.
    if (joinEntry) {
      unjoinTableByNo(sourceNo);
      return;
    }

    // If host is dragged away, unjoin one child so cashier is never stuck in joined state.
    if (hostJoinedSources.length > 0) {
      const toUnjoin = hostJoinedSources[hostJoinedSources.length - 1];
      unjoinTableByNo(toUnjoin);
      return;
    }

    if (nearestTableNo && nearestDist <= JOIN_SNAP_THRESHOLD_PX) {
      await onDropOnTable(nearestTableNo, fromNo);
    }
  };

  const tryJoinByCanvasPoint = async (fromNo) => {
    const point = lastCanvasPointRef.current;
    if (!point || !fromNo) return;
    const { x, y, width, height } = point;

    let nearestTableNo = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const t of tables) {
      const tableNo = Number(t.table_no || 0);
      if (!tableNo || tableNo === fromNo) continue;
      const cx = (Number(t.pos_x || 0) / 100) * width;
      const cy = (Number(t.pos_y || 0) / 100) * height;
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
      

      <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">Floor Map</div>
          <div
            className="relative w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50"
            style={{ minHeight: 560 }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              lastCanvasPointRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                width: rect.width,
                height: rect.height,
              };
            }}
            onDrop={onDropNearTable}
          >
            {tables.map((t) => {
              const tableNo = Number(t.table_no);
              const size = sizeForShape(t.shape);
              const active = activeByTable.has(tableNo);
              const blockedNow = Boolean(blocked[String(tableNo)]);
              const dragOver = dragOverTableNo === tableNo;
              const joinedSources = getJoinedSources(tableNo);
              const isJoinHost = joinedSources.length > 0;
              const joinEntry = getJoinEntry(tableNo);
              const joinedTarget = Number(joinEntry?.target || 0);
              const isJoinedChild = Boolean(joinedTarget);
              const targetTable = isJoinedChild ? tables.find((x) => Number(x.table_no) === joinedTarget) : null;
              const childIndex = isJoinedChild ? getJoinedSources(joinedTarget).indexOf(tableNo) : -1;
              const hostPosX = Number(targetTable?.pos_x || t.pos_x || 10);
              const hostPosY = Number(targetTable?.pos_y || t.pos_y || 10);
              const renderPosX = isJoinedChild ? hostPosX + 2 + Math.max(0, childIndex) * 2.2 : Number(t.pos_x || 10);
              const renderPosY = isJoinedChild ? hostPosY + 2 + Math.max(0, childIndex) * 1.8 : Number(t.pos_y || 10);
              const hostWidth = isJoinHost ? Math.round(size.w * 1.6) : size.w;
              const hostHeight = isJoinHost ? Math.round(size.h * 1.2) : size.h;
              return (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragTableNo(tableNo);
                    dragDropHandledRef.current = false;
                    toast.info(`Dragging T${tableNo}: drop on table to join/move, drop on floor to place${getJoinEntry(tableNo) ? " and unjoin" : ""}.`);
                    try {
                      e.dataTransfer.setData("text/plain", String(tableNo));
                      e.dataTransfer.effectAllowed = "move";
                    } catch {}
                  }}
                  onDragEnd={async () => {
                    const fromNo = Number(dragTableNo || tableNo || 0);
                    if (!dragDropHandledRef.current && fromNo) {
                      await tryJoinByCanvasPoint(fromNo);
                    }
                    setDragTableNo(null);
                    setDragOverTableNo(null);
                    dragDropHandledRef.current = false;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTableNo(tableNo);
                  }}
                  onDragLeave={() => setDragOverTableNo((prev) => (prev === tableNo ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    dragDropHandledRef.current = true;
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
                    left: `${renderPosX}%`,
                    top: `${renderPosY}%`,
                    width: hostWidth,
                    height: hostHeight,
                    background: blockedNow
                      ? "#e2e8f0"
                      : active
                        ? "linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)"
                        : "#ffffff",
                    borderColor: blockedNow ? "#64748b" : active ? "#86efac" : "#d1d5db",
                    boxShadow: active
                      ? "0 0 0 4px rgba(34,197,94,0.14)"
                      : isJoinHost
                        ? "0 0 0 4px rgba(119,31,168,0.18)"
                        : undefined,
                    opacity: isJoinedChild ? 0.94 : 1,
                  }}
                >
                  <div className="text-sm font-bold text-slate-900">T{tableNo}</div>
                  <div className="text-[11px] text-slate-600">
                    {active ? `${activeByTable.get(tableNo)?.count || 0} active` : blockedNow ? "Blocked" : "Available"}
                  </div>
                  {active ? (
                    <div className="mt-1 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Active
                    </div>
                  ) : null}
                  {isJoinHost ? (
                    <div className="mt-1 inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Joined {joinedSources.map((n) => `T${n}`).join(" + ")}
                    </div>
                  ) : null}
                  {isJoinedChild ? (
                    <div className="mt-1 text-[10px] font-semibold text-slate-700">Drag away to unjoin</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

      {detailTableNo ? (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={() => setDetailTableNo(null)} />
          <div className="absolute right-0 top-0 h-full w-full lg:w-[50%] bg-white border-l border-slate-200 shadow-2xl pointer-events-auto overflow-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Table T{detailTableNo}</h2>
                <p className="text-xs text-slate-500">Order details</p>
              </div>
              <button onClick={() => setDetailTableNo(null)} className="h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
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
                <button
                  onClick={() => router.push("/cashier/table-orders")}
                  className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold inline-flex items-center gap-2"
                >
                  View Recent Orders
                </button>
              </div>
              {detailActiveOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">No active orders on this table.</div>
              ) : (
                <div className="space-y-3">
                  {detailActiveOrders.map((o) => {
                    const items = extractOrderItems(o);
                    const customer = extractCustomer(o);
                    const booking = String(o?.booking_status || "").toUpperCase();
                    const payment = String(o?.payment_status || "").toUpperCase();
                    const isPaid = payment === "PAID" || payment === "COMPLETED";
                    const orderClosed = booking === "CANCELLED" || isPaid;
                    const confirmedDone = ["CONFIRMED", "PREPARING", "SERVED", "COMPLETED"].includes(booking) || isPaid;
                    const servedDone = ["SERVED", "COMPLETED"].includes(booking) || isPaid;
                    const completedDone = booking === "COMPLETED" || isPaid;
                    const paidDone = isPaid;
                    const busyOnOrder = updatingOrderKey.startsWith(`${o.id}:`);
                    return (
                      <div key={o.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">Order #{String(o.id).slice(0, 8)}</div>
                          <div className="text-xs text-slate-600">{String(o.booking_status || "PLACED")} • {String(o.payment_status || "PENDING")}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">Customer: {customer.name} {customer.phone ? `(${customer.phone})` : ""}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {items.length ? items.map((it, idx) => (
                            <span key={`${o.id}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                              <span>{it?.name || "Item"} x {Number(it?.qty || 0)}</span>
                              <button
                                type="button"
                                onClick={() => cancelOrderItem(o.id, it)}
                                className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Cancel
                              </button>
                            </span>
                          )) : <span className="text-xs text-slate-500">No item details</span>}
                        </div>
                        <div className="mt-3 text-sm font-semibold text-slate-900">Total: {money(o.total_amount)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={orderClosed || confirmedDone || busyOnOrder}
                            onClick={() => updateOrderState(o.id, { booking_status: "CONFIRMED" }, "confirmed")}
                            className="rounded-lg border border-sky-700 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Mark Confirmed
                          </button>
                          <button
                            type="button"
                            disabled={orderClosed || servedDone || busyOnOrder}
                            onClick={() => updateOrderState(o.id, { booking_status: "SERVED" }, "served")}
                            className="rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Mark Served
                          </button>
                          <button
                            type="button"
                            disabled={orderClosed || completedDone || busyOnOrder}
                            onClick={() => updateOrderState(o.id, { booking_status: "COMPLETED", payment_status: "PENDING" }, "completed")}
                            className="rounded-lg border border-amber-700 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            disabled={paidDone || busyOnOrder}
                            onClick={() => updateOrderState(o.id, { payment_status: "PAID" }, "paid")}
                            className="rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
