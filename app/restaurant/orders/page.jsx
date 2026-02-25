"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const STATUS_FLOW = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "CANCELLED",
];

function inr(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    Number(v || 0)
  );
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  return `${dd}d ago`;
}

function OrdersPageSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6 animate-pulse">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="h-3 w-28 rounded bg-slate-200" />
          <div className="mt-2 h-6 w-44 rounded bg-slate-200" />
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-5 w-10 rounded bg-slate-200" />
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-5 w-10 rounded bg-slate-200" />
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-5 w-10 rounded bg-slate-200" />
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-5 w-10 rounded bg-slate-200" />
            </div>
          </div>
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <div className="flex justify-between gap-3">
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-slate-200" />
                <div className="h-3 w-52 rounded bg-slate-200" />
                <div className="h-3 w-40 rounded bg-slate-200" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-slate-200 ml-auto" />
                <div className="h-3 w-20 rounded bg-slate-200 ml-auto" />
                <div className="h-5 w-20 rounded-full bg-slate-200 ml-auto" />
              </div>
            </div>
            <div className="h-3 w-3/4 rounded bg-slate-200" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((__, j) => (
                <div key={j} className="h-7 w-24 rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PartnerOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const [restaurants, setRestaurants] = useState([]);
  const [filterRestaurant, setFilterRestaurant] = useState("all");
  const [orders, setOrders] = useState([]);

  const ownedRestaurantIdsRef = useRef(new Set());
  const knownOrderIdsRef = useRef(new Set());
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio("/sound.wav");
    audioRef.current.preload = "auto";
    audioRef.current.volume = 1.0;
  }, []);

  const playNewOrderSound = async () => {
    try {
      await audioRef.current?.play();
    } catch {}
  };

  const loadOrders = async (ownedIds, filterId) => {
    const allOwned = ownedIds || Array.from(ownedRestaurantIdsRef.current);
    const currentFilter = filterId || filterRestaurant;

    if (!allOwned.length) {
      setOrders([]);
      knownOrderIdsRef.current = new Set();
      return;
    }

    let query = supabaseBrowser
      .from("restaurant_orders")
      .select(
        "id,restaurant_id,order_number,customer_name,customer_phone,items,total_amount,payment_status,order_status,pickup_code,pickup_eta,created_at"
      )
      .in("restaurant_id", allOwned)
      .order("created_at", { ascending: false })
      .limit(200);

    if (currentFilter !== "all") query = query.eq("restaurant_id", currentFilter);

    const { data, error: qErr } = await query;
    if (qErr) {
      setError(qErr.message || "Failed to load orders");
      return;
    }

    const rows = data || [];
    setOrders(rows);
    knownOrderIdsRef.current = new Set(rows.map((o) => o.id));
  };

  const loadBase = async () => {
    setError("");
    setLoading(true);

    const { data: u } = await supabaseBrowser.auth.getUser();
    const userId = u?.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error: rErr } = await supabaseBrowser
      .from("restaurants")
      .select("id,name")
      .eq("owner_user_id", userId)
      .order("name", { ascending: true });

    if (rErr) {
      setError(rErr.message || "Failed to load restaurants");
      setLoading(false);
      return;
    }

    const list = data || [];
    setRestaurants(list);
    ownedRestaurantIdsRef.current = new Set(list.map((x) => x.id));

    await loadOrders(list.map((x) => x.id), filterRestaurant);
    setLoading(false);
  };

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restaurants.length) {
      loadOrders(
        restaurants.map((r) => r.id),
        filterRestaurant
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRestaurant]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel("partner-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "restaurant_orders" },
        async (payload) => {
          const row = payload.new;
          const owned = ownedRestaurantIdsRef.current.has(row.restaurant_id);
          if (!owned) return;

          if (!knownOrderIdsRef.current.has(row.id)) {
            knownOrderIdsRef.current.add(row.id);
            await playNewOrderSound();
          }

          await loadOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "restaurant_orders" },
        async (payload) => {
          const row = payload.new;
          if (!ownedRestaurantIdsRef.current.has(row.restaurant_id)) return;
          await loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restaurantNameById = useMemo(() => {
    const m = {};
    restaurants.forEach((r) => {
      m[r.id] = r.name;
    });
    return m;
  }, [restaurants]);

  const stats = useMemo(() => {
    const total = orders.length;
    const fresh = orders.filter((o) => o.order_status === "NEW").length;
    const ready = orders.filter((o) => o.order_status === "READY_FOR_PICKUP").length;
    const picked = orders.filter((o) => o.order_status === "PICKED_UP").length;
    return { total, fresh, ready, picked };
  }, [orders]);

  const updateStatus = async (order, nextStatus) => {
    setSavingId(order.id);
    setError("");

    const patch = { order_status: nextStatus };
    if (nextStatus === "ACCEPTED") patch.accepted_at = new Date().toISOString();
    if (nextStatus === "READY_FOR_PICKUP") patch.ready_at = new Date().toISOString();
    if (nextStatus === "PICKED_UP") patch.picked_up_at = new Date().toISOString();
    if (nextStatus === "CANCELLED") patch.cancelled_at = new Date().toISOString();

    const { error: uErr } = await supabaseBrowser
      .from("restaurant_orders")
      .update(patch)
      .eq("id", order.id);

    if (uErr) setError(uErr.message || "Failed to update status");

    setSavingId("");
    await loadOrders();
  };

  if (loading) {
    return <OrdersPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {error ? (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <p className="text-xs text-slate-500">Pickup orders</p>
              <p className="text-xl font-semibold text-slate-900">Partner Orders</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Total</p>
              <p className="font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-xs text-blue-600">New</p>
              <p className="font-semibold text-blue-700">{stats.fresh}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs text-amber-600">Ready</p>
              <p className="font-semibold text-amber-700">{stats.ready}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Picked Up</p>
              <p className="font-semibold text-emerald-700">{stats.picked}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-500 shadow-sm">
              No orders found.
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{o.order_number}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {restaurantNameById[o.restaurant_id] || "Restaurant"} • {timeAgo(o.created_at)}
                    </p>
                    <p className="text-sm text-slate-700 mt-1">
                      {o.customer_name} • {o.customer_phone}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{inr(o.total_amount)}</p>
                    <p className="text-xs text-slate-500 mt-1">Payment: {o.payment_status}</p>
                    <p className="text-xs mt-1">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                        {o.order_status}
                      </span>
                    </p>
                    {o.pickup_code ? (
                      <p className="text-xs text-slate-600 mt-1">Pickup code: {o.pickup_code}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  Items: {(o.items || []).map((x) => `${x.name} x${x.qty}`).join(", ")}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_FLOW.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(o, s)}
                      disabled={savingId === o.id || o.order_status === s}
                      className={`rounded-lg px-3 py-1.5 text-xs ${
                        o.order_status === s
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      } ${savingId === o.id ? "opacity-60" : ""}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
