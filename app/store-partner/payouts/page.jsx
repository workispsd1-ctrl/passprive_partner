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
  X,
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
    s === "paid" || s === "approved" || s === "verified"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "processing" || s === "scheduled" || s === "requested" || s === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : s === "failed" || s === "rejected" || s === "on hold" || s === "not_started"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-100 border border-gray-200 ${className}`} />;
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

function RequestPayoutModal({
  open,
  onClose,
  onConfirm,
  requesting,
  storeName,
  amount,
  method,
  kyc,
  cycle,
  onlineCollected,
  commissionDue,
  toPassPrive,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Confirm Payout Request</div>
            <div className="text-xs text-gray-500 mt-1">Review details before sending to PassPrive.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={requesting}
            className="h-9 w-9 rounded-xl border border-gray-200 inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <div className="text-xs text-orange-700">Amount You Are Requesting</div>
            <div className="mt-1">
              <Amount
                value={amount}
                className="inline-flex items-baseline gap-1"
                currencyClassName="text-xs font-semibold uppercase tracking-wide text-orange-700"
                valueClassName="text-2xl font-bold text-orange-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Store</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{storeName || "-"}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Payout Method</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{method || "-"}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">KYC</div>
              <div className="mt-1">
                <StatusPill status={kyc || "NOT_STARTED"} />
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Settlement Cycle</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{cycle || "-"}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold text-gray-700 mb-3">Settlement Breakdown</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] text-gray-500">Online Collected</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">MUR {formatMoney(onlineCollected)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] text-gray-500">Commission Due</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">MUR {formatMoney(commissionDue)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] text-gray-500">You Owe PassPrive</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">MUR {formatMoney(toPassPrive)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={requesting}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={requesting}
            className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-orange-200 disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
          >
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
            {requesting ? "Sending..." : "Confirm Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toCsvCell(value) {
  const safe = String(value ?? "").replace(/"/g, '""');
  return `"${safe}"`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString();
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const ids = (storeIds || []).map((id) => String(id));
  const { data, error } = await supabaseBrowser
    .from("partner_payout_requests")
    .select("id,store_id,status,requested_amount,method,requested_at,created_at,processed_at,paid_at,reference_no,notes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error && isSchemaError(error)) return [];
  if (error) throw error;

  const rows = (data || []).filter((r) => !r.store_id || ids.includes(String(r.store_id)));
  return rows.map((r) => ({
    id: String(r.id),
    store_id: r.store_id || null,
    status: r.status || "REQUESTED",
    amount: Number(r.requested_amount || 0),
    method: r.method || "BANK_TRANSFER",
    requested_at: r.requested_at || r.created_at || null,
    processed_at: r.processed_at || r.paid_at || null,
    reference_no: r.reference_no || "",
    notes: r.notes || "",
  }));
}

async function createPayoutRequest(userId, storeId, amount, method, details) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseBrowser
    .from("partner_payout_requests")
    .insert({
      user_id: userId,
      store_id: storeId,
      requested_amount: amount,
      method,
      payout_details: details || {},
      status: "REQUESTED",
      requested_at: nowIso,
    })
    .select("id,status,requested_amount,method,requested_at,created_at")
    .single();

  if (error) throw error;
  return {
    id: String(data?.id || `${Date.now()}`),
    store_id: storeId,
    status: data?.status || "REQUESTED",
    amount: Number(data?.requested_amount || amount || 0),
    method: data?.method || method,
    requested_at: data?.requested_at || data?.created_at || nowIso,
    processed_at: null,
    reference_no: "",
    notes: "",
  };
}

export default function StorePartnerPayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [error, setError] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("ALL");
  const [showRequestModal, setShowRequestModal] = useState(false);

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
          .map((r) => r.stores)
          .filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));
        const myStores = Array.from(merged.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );
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
            .select("store_id,payout_method,settlement_cycle,commission_percent,currency,kyc_status")
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

  const settlementByStore = useMemo(() => {
    const map = {};
    orders.filter(isValidOrderForSettlement).forEach((o) => {
      const storeId = String(o.store_id);
      const total = Number(o.total_amount || 0);
      const commissionPct = Number(paymentDetailsByStore[storeId]?.commission_percent || 0);
      const commission = (total * commissionPct) / 100;

      if (!map[storeId]) {
        map[storeId] = {
          businessMade: 0,
          cashReceived: 0,
          onlineCollected: 0,
          commissionDue: 0,
          partnerPayable: 0,
          toPassPrive: 0,
          validOrderCount: 0,
        };
      }

      map[storeId].businessMade += total;
      map[storeId].commissionDue += commission;
      map[storeId].validOrderCount += 1;
      if (isCashMethod(o.payment_method)) map[storeId].cashReceived += total;
      else map[storeId].onlineCollected += total;
    });

    Object.keys(map).forEach((storeId) => {
      const row = map[storeId];
      row.partnerPayable = Math.max(row.onlineCollected - row.commissionDue, 0);
      row.toPassPrive = Math.max(row.commissionDue - row.onlineCollected, 0);
    });

    return map;
  }, [orders, paymentDetailsByStore]);

  const settlement = useMemo(() => {
    const base = {
      businessMade: 0,
      cashReceived: 0,
      onlineCollected: 0,
      commissionDue: 0,
      partnerPayable: 0,
      toPassPrive: 0,
      validOrderCount: 0,
    };

    Object.values(settlementByStore).forEach((s) => {
      base.businessMade += Number(s.businessMade || 0);
      base.cashReceived += Number(s.cashReceived || 0);
      base.onlineCollected += Number(s.onlineCollected || 0);
      base.commissionDue += Number(s.commissionDue || 0);
      base.partnerPayable += Number(s.partnerPayable || 0);
      base.toPassPrive += Number(s.toPassPrive || 0);
      base.validOrderCount += Number(s.validOrderCount || 0);
    });

    return base;
  }, [settlementByStore]);

  const eligibleStores = useMemo(() => {
    return stores
      .map((s) => {
        const sid = String(s.id);
        const pay = settlementByStore[sid] || {
          partnerPayable: 0,
          businessMade: 0,
          commissionDue: 0,
          toPassPrive: 0,
          cashReceived: 0,
          onlineCollected: 0,
          validOrderCount: 0,
        };
        return {
          ...s,
          ...pay,
          payment: paymentDetailsByStore[sid] || null,
        };
      })
      .sort((a, b) => Number(b.partnerPayable || 0) - Number(a.partnerPayable || 0));
  }, [stores, settlementByStore, paymentDetailsByStore]);

  useEffect(() => {
    if (!eligibleStores.length) {
      setSelectedStoreId("ALL");
      return;
    }

    const exists = eligibleStores.some((s) => String(s.id) === String(selectedStoreId));
    if (!exists || selectedStoreId === "ALL") {
      const preferred = eligibleStores.find((s) => s.partnerPayable > 0) || eligibleStores[0];
      setSelectedStoreId(String(preferred.id));
    }
  }, [eligibleStores, selectedStoreId]);

  const selectedStore = useMemo(() => {
    return eligibleStores.find((s) => String(s.id) === String(selectedStoreId)) || null;
  }, [eligibleStores, selectedStoreId]);

  const selectedPayoutAmount = Number(selectedStore?.partnerPayable || 0);
  const selectedKyc = selectedStore?.payment?.kyc_status || "NOT_STARTED";
  const selectedMethod = selectedStore?.payment?.payout_method || "BANK_TRANSFER";
  const selectedCycle = selectedStore?.payment?.settlement_cycle || "-";

  const recentPayouts = useMemo(() => {
    const storeNameById = {};
    stores.forEach((s) => {
      storeNameById[String(s.id)] = s.name;
    });

    return payoutRequests
      .map((r) => ({
        id: r.id,
        storeName: r.store_id ? storeNameById[String(r.store_id)] || "Store" : "All Stores",
        method: r.method || "BANK_TRANSFER",
        amount: Number(r.amount || 0),
        status: r.status || "REQUESTED",
        requestedAt: r.requested_at || "",
        processedAt: r.processed_at || "",
        reference: r.reference_no || "",
        notes: r.notes || "",
      }))
      .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
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

  const latestPaid = useMemo(() => {
    return recentPayouts.find((r) => String(r.status || "").toUpperCase() === "PAID") || null;
  }, [recentPayouts]);

  const canRequestPayout =
    !!selectedStore &&
    selectedPayoutAmount > 0 &&
    !!selectedStore.payment &&
    String(selectedKyc).toUpperCase() === "VERIFIED";

  const requestDisabledReason = useMemo(() => {
    if (!selectedStore) return "Select a store";
    if (!selectedStore.payment) return "Store payment details missing";
    if (String(selectedKyc).toUpperCase() !== "VERIFIED") return "KYC must be VERIFIED";
    if (selectedPayoutAmount <= 0) return "No payable amount";
    return "";
  }, [selectedStore, selectedKyc, selectedPayoutAmount]);

  const handleOpenRequestModal = () => {
    if (requesting || !canRequestPayout) return;
    setRequestError("");
    setRequestSuccess("");
    setShowRequestModal(true);
  };

  const handleRequestPayout = async () => {
    if (requesting || !canRequestPayout) return;
    setRequestError("");
    setRequestSuccess("");
    setRequesting(true);

    try {
      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const userId = sess?.session?.user?.id;
      if (!userId) throw new Error("Please sign in again to request payout.");

      const created = await createPayoutRequest(
        userId,
        selectedStore.id,
        selectedPayoutAmount,
        selectedMethod,
        selectedStore.payment
      );

      setPayoutRequests((prev) => [created, ...prev]);
      setShowRequestModal(false);
      setRequestSuccess(
        `Payout request created for ${selectedStore.name}: MUR ${formatMoney(selectedPayoutAmount)} via ${selectedMethod}.`
      );
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
              onClick={handleOpenRequestModal}
              disabled={loading || requesting || !canRequestPayout}
              title={requestDisabledReason || "Request payout"}
            >
              <CircleDollarSign className="h-4 w-4" />
              {requesting
                ? "Sending..."
                : `Request ${selectedPayoutAmount > 0 ? `MUR ${formatMoney(selectedPayoutAmount)}` : "Payout"}`}
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
                value={formatMoney(settlement.businessMade)}
                helper="Total valid order value"
                icon={Wallet}
                tone="indigo"
              />
              <StatMini
                title="Cash Received"
                value={formatMoney(settlement.cashReceived)}
                helper="Collected directly by partner"
                icon={CheckCircle2}
                tone="emerald"
              />
              <StatMini
                title="Payable To Partner"
                value={formatMoney(settlement.partnerPayable)}
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
          title="Payout Request Preview"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <Store className="h-3.5 w-3.5" />
              Clear payout breakdown
            </div>
          }
        >
          {loading ? (
            <SkeletonBlock className="h-24" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label className="text-xs text-gray-500">Store</label>
                <select
                  className="mt-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                >
                  {eligibleStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Amount To Be Paid</div>
                  <div className="mt-1">
                    <Amount value={selectedPayoutAmount} valueClassName="text-lg font-bold text-gray-900" />
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Payout Method</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{selectedMethod}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">KYC</div>
                  <div className="mt-1">
                    <StatusPill status={selectedKyc} />
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Settlement Cycle</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{selectedCycle}</div>
                </div>
              </div>

              {!canRequestPayout ? (
                <div className="md:col-span-12 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Request blocked: {requestDisabledReason}
                </div>
              ) : null}
            </div>
          )}
        </CardShell>

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
                <div className="text-xs text-gray-500">Last Paid Out</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {latestPaid ? `MUR ${formatMoney(latestPaid.amount)}` : "No paid payouts yet"}
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
              <div className="mt-1 text-sm text-gray-600">Your recent payout requests will appear here.</div>
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

      <RequestPayoutModal
        open={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onConfirm={handleRequestPayout}
        requesting={requesting}
        storeName={selectedStore?.name || ""}
        amount={selectedPayoutAmount}
        method={selectedMethod}
        kyc={selectedKyc}
        cycle={selectedCycle}
        onlineCollected={selectedStore?.onlineCollected || 0}
        commissionDue={selectedStore?.commissionDue || 0}
        toPassPrive={selectedStore?.toPassPrive || 0}
      />
    </div>
  );
}
