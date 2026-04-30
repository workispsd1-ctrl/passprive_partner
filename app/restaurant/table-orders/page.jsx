"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bell, Phone, Hash } from "lucide-react";

const STATUS = {
  PLACED: "PLACED",
  CONFIRMED: "CONFIRMED",
  PREPARING: "PREPARING",
  SERVED: "SERVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-MU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function toItems(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  return [];
}

function badgeClass(status) {
  if (status === STATUS.PLACED) return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === STATUS.CONFIRMED) return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === STATUS.PREPARING) return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === STATUS.SERVED) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === STATUS.COMPLETED) return "bg-teal-50 text-teal-700 border-teal-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function statusLabel(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function TableOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [orders, setOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState("");
  const [draftStatusById, setDraftStatusById] = useState({});
  const [lastStatusById, setLastStatusById] = useState({});
  const knownOrderIdsRef = useRef(new Set());
  const realtimeCleanupRef = useRef(null);

  const orderedList = useMemo(() => {
    const list = [...orders].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });

    if (activeFilter === "ALL") return list;
    return list.filter((o) => o.booking_status === activeFilter);
  }, [orders, activeFilter]);

  const counts = useMemo(() => {
    const c = { ALL: orders.length };
    for (const s of Object.values(STATUS)) c[s] = 0;
    for (const o of orders) c[o.booking_status] = (c[o.booking_status] || 0) + 1;
    return c;
  }, [orders]);

  const liveOrders = useMemo(
    () => orderedList.filter((o) => String(o.booking_status || "").toUpperCase() !== STATUS.COMPLETED),
    [orderedList]
  );
  const completedOrders = useMemo(
    () => orderedList.filter((o) => String(o.booking_status || "").toUpperCase() === STATUS.COMPLETED),
    [orderedList]
  );

  useEffect(() => {
    init();

    return () => {
      if (realtimeCleanupRef.current) realtimeCleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = {};
    for (const o of orders) next[o.id] = o.booking_status;
    setDraftStatusById(next);
  }, [orders]);

  async function init() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: authErr,
    } = await supabaseBrowser.auth.getUser();

    if (authErr) {
      setError(authErr.message || "Failed to read user.");
      setLoading(false);
      return;
    }

    if (!user) {
      setError("Not logged in.");
      setLoading(false);
      return;
    }

    const { data: restaurant, error: restErr } = await supabaseBrowser
      .from("restaurants")
      .select("id,name")
      .eq("owner_user_id", user.id)
      .single();

    if (restErr || !restaurant?.id) {
      setError(restErr?.message || "Restaurant not found for this account.");
      setLoading(false);
      return;
    }

    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name || "Restaurant");

    await fetchOrders(restaurant.id, true);
    realtimeCleanupRef.current = subscribeRealtime(restaurant.id);

    setLoading(false);
  }

  async function fetchOrders(rid = restaurantId, firstLoad = false) {
    if (!rid) return;

    if (!firstLoad) setRefreshing(true);

    const { data, error: qErr } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false });

    if (qErr) {
      setError(qErr.message || "Failed to load orders.");
      setRefreshing(false);
      return;
    }

    const next = Array.isArray(data) ? data : [];

    if (!firstLoad) {
      const currentIds = knownOrderIdsRef.current;
      let hasNew = false;
      for (const o of next) {
        if (!currentIds.has(o.id)) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) playOrderSound();
    }

    knownOrderIdsRef.current = new Set(next.map((o) => o.id));
    setOrders(next);
    setRefreshing(false);
  }

  function subscribeRealtime(rid) {
    const channel = supabaseBrowser
      .channel(`table-orders-${rid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_table_bookings",
          filter: `restaurant_id=eq.${rid}`,
        },
        () => {
          fetchOrders(rid, false);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }

  useEffect(() => {
    if (!restaurantId) return;
    const interval = setInterval(() => fetchOrders(restaurantId, false), 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function playOrderSound() {
    try {
      const a = new Audio("/sounds/new-order.wav");
      a.volume = 0.9;
      a.play().catch(() => {});
    } catch {}
  }

  async function updateStatus(orderId, nextStatus, fallbackStatus) {
    setUpdatingId(orderId);
    setError("");

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, booking_status: nextStatus, updated_at: new Date().toISOString() } : o
      )
    );
    setDraftStatusById((prev) => ({ ...prev, [orderId]: nextStatus }));

    const { error: upErr } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .update({
        booking_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    setUpdatingId("");

    if (upErr) {
      setError(upErr.message || "Failed to update order status.");
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, booking_status: fallbackStatus, updated_at: new Date().toISOString() } : o
        )
      );
      setDraftStatusById((prev) => ({ ...prev, [orderId]: fallbackStatus }));
    }
  }

  async function onChangeStatus(order, nextStatus) {
    if (nextStatus === order.booking_status) {
      setDraftStatusById((prev) => ({ ...prev, [order.id]: nextStatus }));
      return;
    }

    setLastStatusById((prev) => ({ ...prev, [order.id]: order.booking_status }));
    await updateStatus(order.id, nextStatus, order.booking_status);
  }

  async function onCancelDraft(order) {
    const rollbackStatus = lastStatusById[order.id] ?? order.booking_status;
    setDraftStatusById((prev) => ({ ...prev, [order.id]: rollbackStatus }));

    if (rollbackStatus !== order.booking_status) {
      await updateStatus(order.id, rollbackStatus, order.booking_status);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse">
          <div className="h-6 w-52 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-72 rounded bg-slate-100" />
          <div className="mt-6 h-44 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-2xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-slate-900">Table Orders</div>
            <div className="text-sm text-slate-500 mt-1">
              {restaurantName} • Live incoming table orders
            </div>
          </div>
          {refreshing ? <div className="text-xs text-slate-500">Refreshing...</div> : null}
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {["ALL", ...Object.values(STATUS)].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                activeFilter === f
                  ? "bg-amber-700 text-yellow-50 border-amber-700"
                  : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
              }`}
            >
              {f === "ALL" ? "All" : statusLabel(f)} ({counts[f] || 0})
            </button>
          ))}
        </div>
      </div>

      {orderedList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No orders found.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Live Orders</div>
          </div>

          <div className="hidden lg:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Table</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveOrders.map((o) => {
                  const items = toItems(o.order_items);
                  const draft = draftStatusById[o.id] ?? o.booking_status;
                  const preview = items.length
                    ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1}` : ""}`
                    : o.order_details?.items_summary || "No details";
                  return (
                    <tr key={o.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                        <div className="text-xs text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">T{o.table_no || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800">{o.customer_name || "Guest"}</div>
                        <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{preview}</td>
                      <td className="px-4 py-3 text-md text-slate-800 max-w-[220px]">
                        <div className="line-clamp-2">{o.notes || "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{money(o.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                          {statusLabel(o.booking_status)}
                        </span>
                      </td>
                      <td className="px-4 py-1">
                        <div className="flex items-center justify-start gap-2 min-w-[210px]">
                          <select
                            value={draft}
                            disabled={updatingId === o.id}
                            onChange={(e) => onChangeStatus(o, e.target.value)}
                            className="h-9 w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                          >
                            {Object.values(STATUS).map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onCancelDraft(o)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {liveOrders.map((o) => {
              const items = toItems(o.order_items);
              const draft = draftStatusById[o.id] ?? o.booking_status;
              return (
                <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                    </div>
                    <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                      {statusLabel(o.booking_status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Bell className="h-3.5 w-3.5 inline mr-1" />{o.customer_name || "Guest"}</div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Hash className="h-3.5 w-3.5 inline mr-1" />T{o.table_no || "—"}</div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2 col-span-2"><Phone className="h-3.5 w-3.5 inline mr-1" />{o.customer_phone || "—"}</div>
                  </div>

                  <div className="mt-3 text-xs text-slate-700">
                    {items.length
                      ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
                      : o.order_details?.items_summary || "No details"}
                  </div>
                  {o.notes ? (
                    <div className="mt-2 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700">
                      Note: {o.notes}
                    </div>
                  ) : null}
                  <div className="mt-2 text-sm font-semibold text-slate-900">{money(o.total_amount)}</div>

                  <div className="mt-3 flex gap-2">
                    <select
                      value={draft}
                      disabled={updatingId === o.id}
                      onChange={(e) => onChangeStatus(o, e.target.value)}
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                      {Object.values(STATUS).map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onCancelDraft(o)}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 mt-2">
            <div className="text-sm font-semibold text-slate-900">Completed Orders</div>
          </div>

          {completedOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No completed orders yet.
            </div>
          ) : (
            <>
              <div className="hidden lg:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Order</th>
                      <th className="px-4 py-3 text-left">Table</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Items</th>
                      <th className="px-4 py-3 text-left">Note</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedOrders.map((o) => {
                      const items = toItems(o.order_items);
                      const draft = draftStatusById[o.id] ?? o.booking_status;
                      const preview = items.length
                        ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1}` : ""}`
                        : o.order_details?.items_summary || "No details";
                      return (
                        <tr key={o.id} className="align-top">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                            <div className="text-xs text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">T{o.table_no || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800">{o.customer_name || "Guest"}</div>
                            <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{preview}</td>
                          <td className="px-4 py-3 text-md text-slate-800 max-w-[220px]">
                            <div className="line-clamp-2">{o.notes || "—"}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{money(o.total_amount)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                              {statusLabel(o.booking_status)}
                            </span>
                          </td>
                          <td className="px-4 py-1">
                            <div className="flex items-center justify-start gap-2 min-w-[210px]">
                              <select
                                value={draft}
                                disabled={updatingId === o.id}
                                onChange={(e) => onChangeStatus(o, e.target.value)}
                                className="h-9 w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                              >
                                {Object.values(STATUS).map((s) => (
                                  <option key={s} value={s}>
                                    {statusLabel(s)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => onCancelDraft(o)}
                                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Reset
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden space-y-3">
                {completedOrders.map((o) => {
                  const items = toItems(o.order_items);
                  const draft = draftStatusById[o.id] ?? o.booking_status;
                  return (
                    <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                        </div>
                        <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                          {statusLabel(o.booking_status)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Bell className="h-3.5 w-3.5 inline mr-1" />{o.customer_name || "Guest"}</div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Hash className="h-3.5 w-3.5 inline mr-1" />T{o.table_no || "—"}</div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2 col-span-2"><Phone className="h-3.5 w-3.5 inline mr-1" />{o.customer_phone || "—"}</div>
                      </div>

                      <div className="mt-3 text-xs text-slate-700">
                        {items.length
                          ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
                          : o.order_details?.items_summary || "No details"}
                      </div>
                      {o.notes ? (
                        <div className="mt-2 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700">
                          Note: {o.notes}
                        </div>
                      ) : null}
                      <div className="mt-2 text-sm font-semibold text-slate-900">{money(o.total_amount)}</div>

                      <div className="mt-3 flex gap-2">
                        <select
                          value={draft}
                          disabled={updatingId === o.id}
                          onChange={(e) => onChangeStatus(o, e.target.value)}
                          className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                        >
                          {Object.values(STATUS).map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => onCancelDraft(o)}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
