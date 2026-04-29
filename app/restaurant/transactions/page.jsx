"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ReceiptText, Search, SlidersHorizontal, Wallet, CheckCircle2, CircleDollarSign } from "lucide-react";
import { SkeletonBlock } from "@/components/ui/PageSkeletons";

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

function TransactionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="grid gap-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((__, colIdx) => (
            <SkeletonBlock key={colIdx} className="h-12 w-full rounded-2xl border-gray-200 bg-gray-100" />
          ))}
        </div>
      ))}
    </div>
  );
}

function formatMoney(v) {
  return `MUR ${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function isOnlineSession(row) {
  const s = String(row?.payment_status || "").toUpperCase();
  return s !== "CANCELLED";
}

function isValidSession(row) {
  const status = String(row?.payment_status || "").toUpperCase();
  return !["VERIFIED_FAILED", "CANCELLED", "ERROR"].includes(status);
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
        const token = sess?.session?.access_token;
        if (!token) throw new Error("Please sign in to view transactions.");

        const res = await fetch("/api/restaurant/transactions", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load transactions.");

        if (!cancelled) {
          setRestaurants(json.restaurants || []);
          setTransactions(json.transactions || []);
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
    () => transactions.filter(isValidSession),
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
      if (isOnlineSession(t)) out.onlineCollected += amount;
      else out.cashReceived += amount;
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
      if (paymentFilter !== "all" && String(t.payment_status || "").toLowerCase() !== paymentFilter) return false;

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
                <option value="table_orders">TABLE_ORDERS</option>
                <option value="booking">BOOKING</option>
                <option value="bill_payment">BILL_PAYMENT</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="all">All Methods</option>
                <option value="finalized">FINALIZED</option>
                <option value="verified_success">VERIFIED_SUCCESS</option>
                <option value="pending">PENDING</option>
                <option value="returned">RETURNED</option>
              </select>
            </div>
          </div>

          {loading ? (
            <TransactionsSkeleton />
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
                        <td className="py-3 pr-4 text-gray-700">{String(t.source || "").replaceAll("_", " ")}</td>
                        <td className="py-3 pr-4"><Amount value={t.total_amount} /></td>
                        <td className="py-3 pr-4">
                          <div className="text-gray-900 font-medium">{t.payment_method || "IVERI"}</div>
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
