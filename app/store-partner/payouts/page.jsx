"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Wallet,
  Download,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  Clock3,
  Loader2,
  CalendarClock,
  CircleDollarSign,
  Store,
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

function StatMini({ title, value, icon: Icon, tone = "slate", helper = "" }) {
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
        <div
          className={`h-11 w-11 rounded-2xl border flex items-center justify-center ${
            toneMap[tone] || toneMap.slate
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Amount({ value, className = "", valueClassName = "", currencyClassName = "" }) {
  const n = Number(value || 0);
  const num = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span className={className}>
      <span className={currencyClassName || "text-[10px] font-semibold uppercase tracking-wide text-gray-500"}>
        MUR
      </span>{" "}
      <span className={valueClassName || "font-semibold text-gray-900"}>{num}</span>
    </span>
  );
}

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "paid" || s === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "processing" || s === "scheduled" || s === "requested" || s === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : s === "failed" || s === "rejected" || s === "on hold"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gray-100 border border-gray-200 ${className}`}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-gray-100 animate-pulse">
      <div className="flex items-center gap-3 w-full">
        <SkeletonBlock className="h-10 w-10" />
        <div className="space-y-2 w-full">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-28" />
        </div>
      </div>
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-24" />
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-20" />
    </div>
  );
}

function toCsvCell(value) {
  const safe = String(value ?? "").replace(/"/g, '""');
  return `"${safe}"`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString();
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
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

function isSchemaError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("column");
}

async function loadPayoutRequests(userId, storeIds) {
  const tables = ["partner_payout_requests"];
  const ids = (storeIds || []).map((id) => String(id));
  let lastSchemaErr = null;

  for (const table of tables) {
    const tryQueries = [
      () =>
        supabaseBrowser
          .from(table)
          .select("id,store_id,status,requested_amount,method,payout_method,requested_at,created_at,processed_at,paid_at,reference_no,notes")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
      () =>
        supabaseBrowser
          .from(table)
          .select("id,store_id,status,requested_amount,method,payout_method,requested_at,created_at,processed_at,paid_at,reference_no,notes")
          .eq("partner_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
    ];

    for (const run of tryQueries) {
      const { data, error } = await run();
      if (!error) {
        const rows = (data || []).filter((r) => !r.store_id || ids.includes(String(r.store_id)));
        return rows.map((r) => ({
          id: String(r.id),
          store_id: r.store_id || null,
          status: r.status || "REQUESTED",
          amount: Number(r.requested_amount || 0),
          method: r.method || r.payout_method || "BANK_TRANSFER",
          requested_at: r.requested_at || r.created_at || null,
          processed_at: r.processed_at || r.paid_at || null,
          reference_no: r.reference_no || "",
          notes: r.notes || "",
        }));
      }
      if (isSchemaError(error)) {
        lastSchemaErr = error;
        continue;
      }
      throw error;
    }
  }

  if (lastSchemaErr) return [];
  return [];
}

async function createPayoutRequest(userId, storeId, amount, method, details) {
  const nowIso = new Date().toISOString();
  const payloadVariants = [
    {
      table: "partner_payout_requests",
      payload: {
        user_id: userId,
        store_id: storeId,
        requested_amount: amount,
        method,
        payout_details: details || {},
        status: "REQUESTED",
        requested_at: nowIso,
      },
    },
    {
      table: "store_partner_payout_requests",
      payload: {
        user_id: userId,
        store_id: storeId,
        requested_amount: amount,
        method,
        payout_details: details || {},
        status: "REQUESTED",
        requested_at: nowIso,
      },
    },
    {
      table: "payout_requests",
      payload: {
        user_id: userId,
        store_id: storeId,
        requested_amount: amount,
        method,
        status: "REQUESTED",
        requested_at: nowIso,
      },
    },
    {
      table: "payout_requests",
      payload: {
        partner_user_id: userId,
        store_id: storeId,
        requested_amount: amount,
        payout_method: method,
        status: "REQUESTED",
        requested_at: nowIso,
      },
    },
  ];

  let lastSchemaErr = null;

  for (const attempt of payloadVariants) {
    const { data, error } = await supabaseBrowser
      .from(attempt.table)
      .insert(attempt.payload)
      .select("id,status,requested_amount,method,payout_method,requested_at,created_at")
      .single();

    if (!error) {
      return {
        id: String(data?.id || `${Date.now()}`),
        store_id: storeId,
        status: data?.status || "REQUESTED",
        amount: Number(data?.requested_amount || amount || 0),
        method: data?.method || data?.payout_method || method,
        requested_at: data?.requested_at || data?.created_at || nowIso,
        processed_at: null,
        reference_no: "",
        notes: "",
      };
    }

    if (isSchemaError(error)) {
      lastSchemaErr = error;
      continue;
    }
    throw error;
  }

  throw lastSchemaErr || new Error("Could not create payout request.");
}

export default function StorePartnerPayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [error, setError] = useState("");

  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paymentDetailsByStore, setPaymentDetailsByStore] = useState({});
  const [payoutRequests, setPayoutRequests] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sess?.session?.user?.id;
        if (!userId) throw new Error("Please sign in to view payouts.");

        const { data: storesData, error: storeErr } = await supabaseBrowser
          .from("stores")
          .select("id,name")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });

        if (storeErr) throw storeErr;
        const myStores = storesData || [];
        const storeIds = myStores.map((s) => s.id);

        if (!cancelled) setStores(myStores);
        if (!storeIds.length) {
          if (!cancelled) {
            setOrders([]);
            setPaymentDetailsByStore({});
            setPayoutRequests([]);
          }
          return;
        }

        const [ordersRes, paymentRes, payoutReqRes] = await Promise.all([
          supabaseBrowser
            .from("store_orders")
            .select(
              "id,store_id,order_no,total_amount,payment_method,payment_status,status,created_at,updated_at"
            )
            .in("store_id", storeIds)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabaseBrowser
            .from("store_payment_details")
            .select("store_id,payout_method,commission_percent,currency")
            .in("store_id", storeIds),
          loadPayoutRequests(userId, storeIds),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (paymentRes.error) throw paymentRes.error;

        if (!cancelled) {
          setOrders(ordersRes.data || []);
          const map = {};
          (paymentRes.data || []).forEach((r) => {
            map[String(r.store_id)] = r;
          });
          setPaymentDetailsByStore(map);
          setPayoutRequests(payoutReqRes || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load payouts.");
          setStores([]);
          setOrders([]);
          setPaymentDetailsByStore({});
          setPayoutRequests([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const settlement = useMemo(() => {
    const valid = orders.filter(isValidOrderForSettlement);

    let businessMade = 0;
    let cashReceived = 0;
    let onlineCollected = 0;
    let commissionDue = 0;

    valid.forEach((o) => {
      const total = Number(o.total_amount || 0);
      const commissionPct = Number(paymentDetailsByStore[String(o.store_id)]?.commission_percent || 0);
      const commission = (total * commissionPct) / 100;

      businessMade += total;
      commissionDue += commission;

      if (isCashMethod(o.payment_method)) {
        cashReceived += total;
      } else {
        onlineCollected += total;
      }
    });

    const partnerPayable = Math.max(onlineCollected - commissionDue, 0);
    const toPassPrive = Math.max(commissionDue - onlineCollected, 0);

    return {
      businessMade,
      cashReceived,
      onlineCollected,
      commissionDue,
      partnerPayable,
      toPassPrive,
      validOrderCount: valid.length,
    };
  }, [orders, paymentDetailsByStore]);

  const recentPayouts = useMemo(() => {
    const storeNameById = {};
    stores.forEach((s) => {
      storeNameById[String(s.id)] = s.name;
    });

    const fromRequests = payoutRequests.map((r) => ({
      id: r.id,
      storeName: r.store_id ? storeNameById[String(r.store_id)] || "Store" : "All Stores",
      method: r.method || "BANK_TRANSFER",
      amount: Number(r.amount || 0),
      status: r.status || "REQUESTED",
      requestedAt: r.requested_at || "",
      processedAt: r.processed_at || "",
      reference: r.reference_no || "",
      notes: r.notes || "",
    }));

    return fromRequests.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  }, [payoutRequests, stores]);

  const filteredRecentPayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recentPayouts.filter((p) => {
      if (status !== "all" && String(p.status || "").toLowerCase() !== status) return false;
      if (!q) return true;
      const hay = `${p.id} ${p.storeName} ${p.method} ${p.status} ${p.reference}`.toLowerCase();
      return hay.includes(q);
    });
  }, [recentPayouts, search, status]);

  const handleRequestPayout = async () => {
    if (requesting) return;
    setRequestError("");
    setRequestSuccess("");
    setRequesting(true);

    try {
      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const userId = sess?.session?.user?.id;
      if (!userId) throw new Error("Please sign in again to request payout.");
      if (!stores.length) throw new Error("No store found for this account.");

      const primaryStoreId = stores[0].id;
      const details = paymentDetailsByStore[String(primaryStoreId)];
      if (!details) throw new Error("Payment details not found. Please complete payout settings first.");

      const payoutMethod = details?.payout_method || "BANK_TRANSFER";
      const amount = Number(settlement.partnerPayable || 0);
      if (amount <= 0) throw new Error("No payable amount available for payout request.");

      const created = await createPayoutRequest(userId, primaryStoreId, amount, payoutMethod, details);
      setPayoutRequests((prev) => [created, ...prev]);
      setRequestSuccess("Payout request sent successfully.");
    } catch (e) {
      setRequestError(e?.message || "Failed to send payout request.");
    } finally {
      setRequesting(false);
    }
  };

  const handleExport = () => {
    const rows = [];
    rows.push(["Payout Settlement Export"]);
    rows.push(["Generated At", new Date().toLocaleString()]);
    rows.push(["Business Made", settlement.businessMade]);
    rows.push(["Cash Received", settlement.cashReceived]);
    rows.push(["Commission Due", settlement.commissionDue]);
    rows.push(["Payable To Partner", settlement.partnerPayable]);
    rows.push(["To PassPrive", settlement.toPassPrive]);
    rows.push([]);
    rows.push([
      "Request ID",
      "Store",
      "Requested Amount",
      "Method",
      "Status",
      "Requested At",
      "Processed At",
      "Reference",
    ]);

    filteredRecentPayouts.forEach((p) => {
      rows.push([
        p.id,
        p.storeName,
        p.amount,
        p.method,
        p.status,
        p.requestedAt,
        p.processedAt,
        p.reference,
      ]);
    });

    const csv = rows.map((r) => r.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    const a = document.createElement("a");
    a.href = url;
    a.download = `payout-settlement-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div />
          <div className="flex items-center gap-2">
            <button
              className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 shadow-sm disabled:opacity-60"
              type="button"
              onClick={handleExport}
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-orange-200 disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
              }}
              type="button"
              onClick={handleRequestPayout}
              disabled={loading || requesting || Number(settlement.partnerPayable || 0) <= 0}
            >
              <CircleDollarSign className="h-4 w-4" />
              {requesting ? "Sending..." : "Request Payout"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {requestError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{requestError}</div>
        ) : null}

        {requestSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {requestSuccess}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
            </>
          ) : (
            <>
              <StatMini
                title="Business Made"
                value={Number(settlement.businessMade || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                helper="Total valid order value"
                icon={Wallet}
                tone="indigo"
              />
              <StatMini
                title="Cash Received"
                value={Number(settlement.cashReceived || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                helper="Collected directly by partner"
                icon={CheckCircle2}
                tone="emerald"
              />
              <StatMini
                title="Payable To Partner"
                value={Number(settlement.partnerPayable || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                helper="Online collections minus commission"
                icon={Loader2}
                tone="orange"
              />
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">To PassPrive</div>
                    <div className="mt-1">
                      <Amount
                        value={settlement.toPassPrive}
                        className="inline-flex items-baseline gap-1"
                        currencyClassName="text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                        valueClassName="text-2xl font-bold text-gray-900"
                      />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">Pending platform recovery from partner</div>
                  </div>
                  <div className="h-11 w-11 rounded-2xl border flex items-center justify-center bg-slate-50 text-slate-700 border-slate-200">
                    <CircleDollarSign className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <CardShell
          title="Settlement Snapshot"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <Store className="h-3.5 w-3.5" />
              {stores.length} store(s)
            </div>
          }
        >
          {loading ? (
            <SkeletonBlock className="h-20" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Online Collected</div>
                <div className="mt-1">
                  <Amount value={settlement.onlineCollected} />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Commission Due</div>
                <div className="mt-1">
                  <Amount value={settlement.commissionDue} />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Valid Orders</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{settlement.validOrderCount}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Current Action</div>
                <div className="mt-1 text-sm font-medium text-gray-800">
                  {settlement.partnerPayable > 0
                    ? "Partner can request payout"
                    : settlement.toPassPrive > 0
                    ? "Partner owes PassPrive"
                    : "Balanced"}
                </div>
              </div>
            </div>
          )}
        </CardShell>

        <CardShell
          title="Recent Payout Details"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Live requests
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
            <div className="md:col-span-8">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  placeholder="Search request id, method, store..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-4">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="requested">Requested</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : filteredRecentPayouts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-gray-800" />
              </div>
              <div className="mt-3 text-lg font-semibold text-gray-900">No payout records found</div>
              <div className="mt-1 text-sm text-gray-600">
                Your recent payout requests will appear here.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Request</th>
                    <th className="py-2 pr-4 font-medium">Store</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Requested</th>
                    <th className="py-2 pr-0 font-medium">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecentPayouts.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-gray-900">{p.id}</p>
                        <p className="text-xs text-gray-500">
                          <Clock3 className="h-3 w-3 inline-block mr-1" />
                          {p.reference ? `Ref: ${p.reference}` : "No reference"}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{p.storeName}</td>
                      <td className="py-3 pr-4">
                        <Amount
                          value={p.amount}
                          className="inline-flex items-baseline gap-1"
                          currencyClassName="text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                          valueClassName="font-semibold text-gray-900"
                        />
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{p.method}</td>
                      <td className="py-3 pr-4">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        <div className="text-xs inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDateTime(p.requestedAt)}
                        </div>
                      </td>
                      <td className="py-3 pr-0 text-gray-600">
                        <div className="text-xs inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDateTime(p.processedAt)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      </div>
    </div>
  );
}
