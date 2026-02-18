"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Bell,
  Clock3,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  XCircle,
  Phone,
  Hash,
  RefreshCw,
} from "lucide-react";

const STATUS = {
  PLACED: "PLACED",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PREPARING",
  READY: "READY",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
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
  if (status === STATUS.ACCEPTED) return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === STATUS.PREPARING) return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === STATUS.READY) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === STATUS.COMPLETED) return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function nextStatuses(status) {
  if (status === STATUS.PLACED) return [STATUS.ACCEPTED, STATUS.CANCELLED];
  if (status === STATUS.ACCEPTED) return [STATUS.PREPARING, STATUS.CANCELLED];
  if (status === STATUS.PREPARING) return [STATUS.READY, STATUS.CANCELLED];
  if (status === STATUS.READY) return [STATUS.COMPLETED];
  return [];
}

function statusLabel(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
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
  const knownOrderIdsRef = useRef(new Set());

  const orderedList = useMemo(() => {
    const list = [...orders].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });

    if (activeFilter === "ALL") return list;
    return list.filter((o) => o.status === activeFilter);
  }, [orders, activeFilter]);

  const counts = useMemo(() => {
    const c = { ALL: orders.length };
    for (const s of Object.values(STATUS)) c[s] = 0;
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    subscribeRealtime(restaurant.id);

    setLoading(false);
  }

  async function fetchOrders(rid = restaurantId, firstLoad = false) {
    if (!rid) return;

    if (!firstLoad) setRefreshing(true);

    const { data, error: qErr } = await supabaseBrowser
      .from("restaurant_table_orders")
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
          table: "restaurant_table_orders",
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

  async function updateStatus(orderId, nextStatus) {
    setUpdatingId(orderId);
    setError("");

    const { error: upErr } = await supabaseBrowser
      .from("restaurant_table_orders")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    setUpdatingId("");

    if (upErr) {
      setError(upErr.message || "Failed to update order status.");
      return;
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updated_at: new Date().toISOString() } : o))
    );
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-slate-900">Table Orders</div>
            <div className="text-sm text-slate-500 mt-1">
              {restaurantName} • Live incoming orders from customer menu
            </div>
          </div>
         </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 ">
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
          No orders found for selected filter.
        </div>
      ) : (
        <div className="space-y-3">
          {orderedList.map((o) => {
            const items = toItems(o.items);
            const next = nextStatuses(o.status);

            return (
              <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Order #{String(o.id).slice(0, 8)}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                    </div>
                  </div>

                  <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.status)}`}>
                    {statusLabel(o.status)}
                  </span>
                </div>

                <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs text-slate-700">
                  <div className="inline-flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-slate-500" />
                    {o.customer_name || "Guest"}
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    {o.customer_phone || "—"}
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-slate-500" />
                    Table: {o.table_no || "N/A"}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">Items</div>
                  <div className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">No items</div>
                    ) : (
                      items.map((it, idx) => (
                        <div key={`${o.id}-${idx}`} className="px-3 py-2 text-xs flex justify-between gap-2">
                          <div className="text-slate-700">
                            {it.name} x {it.qty}
                          </div>
                          <div className="font-semibold text-slate-900">{money((Number(it.price) || 0) * (Number(it.qty) || 0))}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                    Subtotal: <span className="font-semibold text-slate-900">{money(o.subtotal_amount)}</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                    Tax ({Number(o.tax_percent || 0)}%): <span className="font-semibold text-slate-900">{money(o.tax_amount)}</span>
                  </div>
                  <div className="rounded-lg bg-amber-50 border-amber-700 border-1 px-3 py-2 text-black">
                    Total: <span className="font-semibold">{money(o.total_amount)}</span>
                  </div>
                </div>

                {o.notes ? (
                  <div className="mt-3 text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    Note: {o.notes}
                  </div>
                ) : null}

                {next.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {next.map((s) => (
                      <button
                        key={`${o.id}-${s}`}
                        disabled={updatingId === o.id}
                        onClick={() => updateStatus(o.id, s)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold border ${
                          s === STATUS.CANCELLED
                            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "border-amber-300 bg-yellow-50 text-amber-700 hover:bg-yellow-100"
                        } disabled:opacity-50`}
                      >
                        {s === STATUS.ACCEPTED ? (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                          </span>
                        ) : s === STATUS.PREPARING ? (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <ChefHat className="h-3.5 w-3.5" /> Preparing
                          </span>
                        ) : s === STATUS.READY ? (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <PackageCheck className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : s === STATUS.COMPLETED ? (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <Clock3 className="h-3.5 w-3.5" /> Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 cursor-pointer">
                            <XCircle className="h-3.5 w-3.5" /> Cancel
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
