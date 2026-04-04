"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ReceiptText,
  Search,
  SlidersHorizontal,
  Wallet,
  CheckCircle2,
  CircleDollarSign,
} from "lucide-react";

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

export default function StoreTransactionsPage() {
  const ACTIVE_STORE_KEY = "store_partner_selected_store_id";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stores, setStores] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    try {
      const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY) || "";
      if (activeStoreId) setStoreFilter(String(activeStoreId));
    } catch {}
  }, []);

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

        const ownerStoresRes = await supabaseBrowser
          .from("stores")
          .select("id,name")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });

        if (ownerStoresRes.error) throw ownerStoresRes.error;

        const memberStoresRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id(id,name)")
          .eq("user_id", userId);

        if (memberStoresRes.error) throw memberStoresRes.error;

        const ownerStores = ownerStoresRes.data || [];
        const memberStores = (memberStoresRes.data || [])
          .map((r) => (Array.isArray(r.stores) ? r.stores[0] : r.stores))
          .filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));
        const myStores = Array.from(merged.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        const storeIds = myStores.map((s) => s.id);

        if (!storeIds.length) {
          if (!cancelled) {
            setStores([]);
            setTransactions([]);
          }
          return;
        }

        const ordersRes = await supabaseBrowser
          .from("store_orders")
          .select("id,store_id,total_amount,payment_method,payment_status,status,created_at,updated_at")
          .in("store_id", storeIds)
          .order("created_at", { ascending: false })
          .limit(2000);

        if (ordersRes.error) throw ordersRes.error;

        if (!cancelled) {
          setStores(myStores);
          setTransactions(ordersRes.data || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load transactions.");
          setStores([]);
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

  const storeNameById = useMemo(() => {
    const map = {};
    stores.forEach((s) => {
      map[String(s.id)] = s.name;
    });
    return map;
  }, [stores]);

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
      const sid = String(t.store_id || "");
      const name = storeNameById[sid] || "Store";

      if (storeFilter !== "all" && sid !== storeFilter) return false;
      if (paymentFilter !== "all" && String(t.payment_method || "").toLowerCase() !== paymentFilter) return false;

      if (!q) return true;
      const hay = `${t.id} ${name} ${t.payment_method} ${t.payment_status} ${t.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [validTransactions, search, storeFilter, paymentFilter, storeNameById]);

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
          title="Store Transactions"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Live payments
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
            <div className="md:col-span-7">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  placeholder="Search transaction, store, status..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
              >
                <option value="all">All Stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
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
                    <th className="py-2 pr-4 font-medium">Store</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Payment</th>
                    <th className="py-2 pr-4 font-medium">Order</th>
                    <th className="py-2 pr-0 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => {
                    const sid = String(t.store_id || "");
                    return (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 pr-4 font-semibold text-gray-900">{t.id}</td>
                        <td className="py-3 pr-4 text-gray-700">{storeNameById[sid] || "Store"}</td>
                        <td className="py-3 pr-4"><Amount value={t.total_amount} /></td>
                        <td className="py-3 pr-4">
                          <div className="text-gray-700">{t.payment_method || "ONLINE"}</div>
                          <div className="mt-1">
                            <StatusPill status={t.payment_status || "PENDING"} />
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusPill status={t.status || "NEW"} />
                        </td>
                        <td className="py-3 pr-0 text-xs text-gray-600">{formatDateTime(t.created_at || t.updated_at)}</td>
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
