"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ReceiptText, Search, SlidersHorizontal, Wallet, CheckCircle2, CircleDollarSign } from "lucide-react";

function CardShell({ title, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-gray-900">{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StatMini({ title, value, helper, icon: Icon, tone = "slate" }) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
          {helper ? <div className="text-[11px] text-gray-500 mt-1">{helper}</div> : null}
        </div>
        <div className={`h-11 w-11 rounded-2xl border flex items-center justify-center ${toneMap[tone] || toneMap.slate}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Amount({ value }) {
  const n = Number(value || 0);
  const num = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">MUR</span>
      <span className="font-semibold text-gray-900">{num}</span>
    </span>
  );
}

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "paid" || s === "approved" || s === "verified"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "processing" || s === "scheduled" || s === "requested" || s === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : s === "failed" || s === "rejected" || s === "on_hold" || s === "cancelled"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>{status}</span>;
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function isSchemaError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("column");
}

function isCashMethod(paymentMethod) {
  const p = String(paymentMethod || "").toUpperCase();
  return p === "COD" || p === "CASH";
}

function isValidOrderForSettlement(order) {
  const status = String(order?.status || "").toUpperCase();
  const paymentStatus = String(order?.payment_status || "").toUpperCase();

  if (status === "CANCELLED" || status === "REJECTED") return false;
  if (paymentStatus === "FAILED" || paymentStatus === "REFUNDED") return false;
  return true;
}

async function loadRestaurantTransactions(restaurantIds) {
  const ids = (restaurantIds || []).map((id) => String(id));
  if (!ids.length) return [];

  const [tablePrimary, pickupPrimary] = await Promise.all([
    supabaseBrowser
      .from("restaurant_bookings")
      .select("id,restaurant_id,payment_amount,payment_method,payment_status,status,created_at,updated_at")
      .in("restaurant_id", ids)
      .order("created_at", { ascending: false })
      .limit(3000),
    supabaseBrowser
      .from("restaurant_orders")
      .select("id,restaurant_id,total_amount,payment_status,order_status,created_at,updated_at")
      .in("restaurant_id", ids)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);

  let tableRows = [];
  if (!tablePrimary.error) {
    tableRows = tablePrimary.data || [];
  } else if (isSchemaError(tablePrimary.error)) {
    const fallback = await supabaseBrowser
      .from("restaurant_bookings")
      .select("id,restaurant_id,payment_amount,status,created_at,updated_at")
      .in("restaurant_id", ids)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (fallback.error) throw fallback.error;

    tableRows = (fallback.data || []).map((r) => ({
      ...r,
      payment_method: "ONLINE",
      payment_status: "PAID",
    }));
  } else {
    throw tablePrimary.error;
  }

  let pickupRows = [];
  if (!pickupPrimary.error) {
    pickupRows = pickupPrimary.data || [];
  } else if (!isSchemaError(pickupPrimary.error)) {
    throw pickupPrimary.error;
  }

  const normalizedTable = tableRows.map((r) => ({
    id: `table_${r.id}`,
    restaurant_id: r.restaurant_id,
    total_amount: Number(r.payment_amount || 0),
    payment_method: r.payment_method || "ONLINE",
    payment_status: String(r.payment_status || "pending").toUpperCase(),
    status: String(r.status || "pending").toUpperCase(),
    created_at: r.created_at,
    updated_at: r.updated_at,
    source: "Booking",
  }));

  const normalizedPickup = pickupRows.map((r) => ({
    id: `pickup_${r.id}`,
    restaurant_id: r.restaurant_id,
    total_amount: Number(r.total_amount || 0),
    payment_method: String(r.payment_status || "").toUpperCase() === "PAID" ? "ONLINE" : "COD",
    payment_status: r.payment_status || "PENDING",
    status: r.order_status || "NEW",
    created_at: r.created_at,
    updated_at: r.updated_at,
    source: "Pickup",
  }));

  return [...normalizedTable, ...normalizedPickup].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
}

export default function RestaurantTransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [restaurants, setRestaurants] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [search, setSearch] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sess?.session?.user?.id;
        if (!userId) throw new Error("Please sign in to view transactions.");

        const restaurantRes = await supabaseBrowser
          .from("restaurants")
          .select("id,name")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });

        if (restaurantRes.error) throw restaurantRes.error;

        const myRestaurants = restaurantRes.data || [];
        const ids = myRestaurants.map((r) => r.id);
        const rows = await loadRestaurantTransactions(ids);

        if (!cancelled) {
          setRestaurants(myRestaurants);
          setTransactions(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load transactions.");
          setRestaurants([]);
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const restaurantNameById = useMemo(() => {
    const map = {};
    restaurants.forEach((r) => {
      map[String(r.id)] = r.name;
    });
    return map;
  }, [restaurants]);

  const validTransactions = useMemo(
    () => transactions.filter(isValidOrderForSettlement),
    [transactions]
  );

  const summary = useMemo(() => {
    const out = {
      businessMade: 0,
      cashReceived: 0,
      onlineCollected: 0,
      totalTransactions: 0,
    };

    validTransactions.forEach((t) => {
      const amount = Number(t.total_amount || 0);
      out.businessMade += amount;
      out.totalTransactions += 1;
      if (isCashMethod(t.payment_method)) out.cashReceived += amount;
      else out.onlineCollected += amount;
    });

    return out;
  }, [validTransactions]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();

    return validTransactions.filter((t) => {
      const rid = String(t.restaurant_id || "");
      const name = restaurantNameById[rid] || "Restaurant";

      if (restaurantFilter !== "all" && rid !== restaurantFilter) return false;
      if (sourceFilter !== "all" && String(t.source).toLowerCase() !== sourceFilter) return false;
      if (paymentFilter !== "all" && String(t.payment_method || "").toLowerCase() !== paymentFilter) return false;

      if (!q) return true;
      const hay = `${t.id} ${name} ${t.source} ${t.payment_method} ${t.payment_status} ${t.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [validTransactions, search, restaurantFilter, sourceFilter, paymentFilter, restaurantNameById]);

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatMini title="Business Made" value={formatMoney(summary.businessMade)} helper="Total valid transaction value" icon={Wallet} tone="indigo" />
          <StatMini title="Cash Received" value={formatMoney(summary.cashReceived)} helper="COD/Cash collections" icon={CheckCircle2} tone="emerald" />
          <StatMini title="Online Collected" value={formatMoney(summary.onlineCollected)} helper="Online paid collections" icon={CircleDollarSign} tone="orange" />
          <StatMini title="Transactions" value={String(summary.totalTransactions)} helper="Valid transactions" icon={ReceiptText} tone="slate" />
        </div>

        <CardShell
          title="Restaurant Transactions"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Live payments
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
            <div className="md:col-span-5">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  placeholder="Search transaction, restaurant, status..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={restaurantFilter}
                onChange={(e) => setRestaurantFilter(e.target.value)}
              >
                <option value="all">All Restaurants</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">All Sources</option>
                <option value="table">Table</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="all">All Methods</option>
                <option value="online">ONLINE</option>
                <option value="cod">COD</option>
                <option value="cash">CASH</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Loading transactions...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
                <ReceiptText className="h-6 w-6 text-gray-800" />
              </div>
              <div className="mt-3 text-lg font-semibold text-gray-900">No transactions found</div>
              <div className="mt-1 text-sm text-gray-600">Try changing filters or check payment activity.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Transaction</th>
                    <th className="py-2 pr-4 font-medium">Restaurant</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Payment</th>
                    <th className="py-2 pr-4 font-medium">Order</th>
                    <th className="py-2 pr-0 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => {
                    const rid = String(t.restaurant_id || "");
                    return (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 pr-4 font-semibold text-gray-900">{t.id}</td>
                        <td className="py-3 pr-4 text-gray-700">{restaurantNameById[rid] || "Restaurant"}</td>
                        <td className="py-3 pr-4 text-gray-700">{t.source}</td>
                        <td className="py-3 pr-4"><Amount value={t.total_amount} /></td>
                        <td className="py-3 pr-4">
                          <div className="text-gray-700">{t.payment_method}</div>
                          <div className="mt-1">
                            <StatusPill status={t.payment_status} />
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusPill status={t.status} />
                        </td>
                        <td className="py-3 pr-0 text-xs text-gray-600">{formatDateTime(t.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      </div>
    </div>
  );
}
