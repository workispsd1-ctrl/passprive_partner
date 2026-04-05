"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Download,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useStores } from "@/lib/store-partner/useStores";

const THEME_ACCENT = "#771FA8";
const THEME_ACCENT_SOFT = "rgba(119, 31, 168, 0.12)";
const THEME_BORDER = "rgba(119, 31, 168, 0.18)";
const SUCCESS_STATUSES = new Set(["VERIFIED_SUCCESS", "FINALIZED"]);
const CANCELLED_STATUSES = new Set(["CANCELLED"]);
const IN_TRANSIT_PAYOUT_STATUSES = new Set(["REQUESTED", "PENDING", "PROCESSING", "APPROVED"]);
const PAID_PAYOUT_STATUSES = new Set(["PAID"]);

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function amountNode(value, strong = false) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">MUR</span>
      <span className={strong ? "text-2xl font-bold text-slate-900" : "font-semibold text-slate-900"}>
        {formatMoney(value)}
      </span>
    </span>
  );
}

function toCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function asNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getSessionStatus(row) {
  return String(row?.status || row?.gateway_status || "").toUpperCase();
}

function isSuccessfulSession(row) {
  return SUCCESS_STATUSES.has(getSessionStatus(row));
}

function isCancelledSession(row) {
  return CANCELLED_STATUSES.has(getSessionStatus(row));
}

function getSessionTimestamp(row) {
  return row?.verified_at || row?.created_at || null;
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskAccount(value) {
  const clean = String(value || "").trim();
  if (!clean) return "Not added";
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
}

function payoutStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (PAID_PAYOUT_STATUSES.has(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (IN_TRANSIT_PAYOUT_STATUSES.has(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["FAILED", "REJECTED", "ON_HOLD", "CANCELLED"].includes(normalized)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function paymentStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "CANCELLED") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusPill({ status, tone = "payout" }) {
  const cls = tone === "payment" ? paymentStatusTone(status) : payoutStatusTone(status);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function Card({ title, subtitle, right, children }) {
  return (
    <section className="rounded-[30px] border bg-white shadow-sm" style={{ borderColor: THEME_BORDER }}>
      <div className="flex flex-col gap-3 border-b px-6 py-5 md:flex-row md:items-center md:justify-between" style={{ borderColor: THEME_BORDER }}>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function StatCard({ label, value, helper, icon: Icon, accent = "purple" }) {
  const iconStyle =
    accent === "green"
      ? {
          background: "rgba(16, 185, 129, 0.10)",
          color: "#047857",
          borderColor: "rgba(16, 185, 129, 0.18)",
        }
      : accent === "amber"
      ? {
          background: "rgba(245, 158, 11, 0.12)",
          color: "#B45309",
          borderColor: "rgba(245, 158, 11, 0.18)",
        }
      : {
          background: THEME_ACCENT_SOFT,
          color: THEME_ACCENT,
          borderColor: THEME_BORDER,
        };

  return (
    <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: THEME_BORDER }}>
      <div className="flex min-h-[128px] items-start justify-between gap-4">
        <div className="flex min-h-[128px] flex-1 flex-col">
          <div className="min-h-[52px] text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-3 flex min-h-[56px] items-end">{value}</div>
          {helper ? <div className="mt-2 text-sm text-slate-600">{helper}</div> : null}
        </div>
        <div
          className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border"
          style={iconStyle}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="rounded-[28px] border border-dashed p-10 text-center" style={{ borderColor: THEME_BORDER, background: "rgba(248,250,252,0.7)" }}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px]" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-4 text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{body}</div>
    </div>
  );
}

function RequestPayoutModal({
  open,
  onClose,
  onConfirm,
  requesting,
  storeName,
  maxAmount,
  customAmount,
  onCustomAmountChange,
  method,
  gross,
  paidOut,
  inTransit,
}) {
  if (!open) return null;
  const safeCustomAmount = typeof customAmount === "string" ? customAmount : String(customAmount ?? "");
  const enteredAmount = asNumber(safeCustomAmount);
  const isInvalidAmount = enteredAmount <= 0 || enteredAmount > maxAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: THEME_BORDER }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Confirm payout request</h3>
            <p className="mt-1 text-sm text-slate-500">Review the settlement details before sending this request.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={requesting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 disabled:opacity-60"
            style={{ borderColor: THEME_BORDER }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-[24px] p-5" style={{ background: "rgba(119, 31, 168, 0.08)" }}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#771FA8]">Request amount</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#771FA8]">MUR</span>
              <input
                type="number"
                min="0"
                step="0.01"
                max={maxAmount || undefined}
                value={safeCustomAmount}
                onChange={(e) => onCustomAmountChange(e.target.value)}
                inputMode="decimal"
                className="h-12 w-full appearance-none rounded-2xl border border-[rgba(119,31,168,0.18)] bg-white/90 px-4 text-2xl font-bold text-[#5B1685] outline-none [moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">Maximum available: MUR {formatMoney(maxAmount)}</div>
            {isInvalidAmount ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Enter an amount greater than 0 and not more than the total payout amount.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
              <div className="text-xs text-slate-500">Store</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{storeName || "-"}</div>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
              <div className="text-xs text-slate-500">Payout method</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{method || "-"}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: THEME_BORDER }}>
              <div className="text-xs text-slate-500">Gross collected</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">MUR {formatMoney(gross)}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: THEME_BORDER }}>
              <div className="text-xs text-slate-500">Already paid out</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">MUR {formatMoney(paidOut)}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: THEME_BORDER }}>
              <div className="text-xs text-slate-500">In transit</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">MUR {formatMoney(inTransit)}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <button
            type="button"
            onClick={onClose}
            disabled={requesting}
            className="rounded-full border px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            style={{ borderColor: THEME_BORDER }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={requesting || isInvalidAmount}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: THEME_ACCENT, boxShadow: "0 12px 24px rgba(119, 31, 168, 0.24)" }}
          >
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
            {requesting ? "Sending..." : "Confirm request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function isSchemaError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("column");
}

async function loadPayoutRequests(userId, storeId) {
  if (!userId || !storeId) return [];

  const { data, error } = await supabaseBrowser
    .from("partner_payout_requests")
    .select("id,store_id,status,requested_amount,method,requested_at,created_at,processed_at,paid_at,reference_no,notes")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error && isSchemaError(error)) return [];
  if (error) throw error;

  return (data || []).map((row) => ({
    id: String(row.id),
    status: row.status || "REQUESTED",
    amount: asNumber(row.requested_amount),
    method: row.method || "BANK_TRANSFER",
    requested_at: row.requested_at || row.created_at || null,
    processed_at: row.processed_at || row.paid_at || null,
    reference_no: row.reference_no || "",
    notes: row.notes || "",
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
    .select("id,status,requested_amount,method,requested_at,created_at,processed_at,paid_at,reference_no,notes")
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    status: data.status || "REQUESTED",
    amount: asNumber(data.requested_amount),
    method: data.method || method,
    requested_at: data.requested_at || data.created_at || nowIso,
    processed_at: data.processed_at || data.paid_at || null,
    reference_no: data.reference_no || "",
    notes: data.notes || "",
  };
}

export default function StorePartnerPayoutsPage() {
  const { loading: storesLoading, stores, selectedStoreId, selectedStore, changeStore } = useStores();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [paymentSessions, setPaymentSessions] = useState([]);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [userId, setUserId] = useState("");
  const [customRequestAmount, setCustomRequestAmount] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPage(silent = false) {
      if (!selectedStoreId) {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          setPaymentDetails(null);
          setPaymentSessions([]);
          setPayoutRequests([]);
        }
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const { data: sessionData, error: sessionError } = await supabaseBrowser.auth.getSession();
        if (sessionError) throw sessionError;

        const currentUserId = sessionData?.session?.user?.id;
        if (!currentUserId) throw new Error("Please sign in to view payouts.");
        if (!cancelled) setUserId(currentUserId);

        const [paymentDetailsRes, sessionsRes, payoutReqs] = await Promise.all([
          supabaseBrowser
            .from("store_payment_details")
            .select(
              "store_id,payout_method,settlement_cycle,commission_percent,currency,kyc_status,beneficiary_name,bank_name,account_number,iban,swift,billing_email,billing_phone"
            )
            .eq("store_id", selectedStoreId)
            .maybeSingle(),
          supabaseBrowser
            .from("payment_sessions")
            .select(
              "id,tracking_id,payment_provider,amount_major,original_amount,discount_amount,currency_code,status,gateway_status,created_at,verified_at,discount_source"
            )
            .eq("payment_context", "BILL_PAYMENT")
            .eq("store_id", selectedStoreId)
            .order("created_at", { ascending: false })
            .limit(500),
          loadPayoutRequests(currentUserId, selectedStoreId),
        ]);

        if (paymentDetailsRes.error && !isSchemaError(paymentDetailsRes.error)) throw paymentDetailsRes.error;
        if (sessionsRes.error) throw sessionsRes.error;

        if (!cancelled) {
          setPaymentDetails(paymentDetailsRes.data || null);
          setPaymentSessions(sessionsRes.data || []);
          setPayoutRequests(payoutReqs || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load payout data.");
          setPaymentDetails(null);
          setPaymentSessions([]);
          setPayoutRequests([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [selectedStoreId]);

  const summary = useMemo(() => {
    const successful = paymentSessions.filter(isSuccessfulSession);
    const cancelled = paymentSessions.filter(isCancelledSession);

    const grossCollected = successful.reduce(
      (sum, row) => sum + asNumber(row.original_amount || row.amount_major),
      0
    );
    const netCollected = successful.reduce((sum, row) => sum + asNumber(row.amount_major), 0);
    const discountsGiven = successful.reduce((sum, row) => sum + asNumber(row.discount_amount), 0);
    const cancelledValue = cancelled.reduce((sum, row) => sum + asNumber(row.amount_major), 0);

    const inTransit = payoutRequests
      .filter((row) => IN_TRANSIT_PAYOUT_STATUSES.has(String(row.status || "").toUpperCase()))
      .reduce((sum, row) => sum + asNumber(row.amount), 0);
    const paidOut = payoutRequests
      .filter((row) => PAID_PAYOUT_STATUSES.has(String(row.status || "").toUpperCase()))
      .reduce((sum, row) => sum + asNumber(row.amount), 0);

    const availableBalance = Math.max(netCollected - inTransit - paidOut, 0);
    const latestPaid = payoutRequests.find((row) => PAID_PAYOUT_STATUSES.has(String(row.status || "").toUpperCase())) || null;

    return {
      successful,
      cancelled,
      grossCollected,
      netCollected,
      discountsGiven,
      cancelledValue,
      inTransit,
      paidOut,
      availableBalance,
      latestPaid,
    };
  }, [paymentSessions, payoutRequests]);

  const requestDisabledReason = useMemo(() => {
    if (!selectedStoreId) return "Select a store";
    if (!paymentDetails) return "Payout details are not configured yet";
    if (summary.availableBalance <= 0) return "No available balance to request";
    return "";
  }, [selectedStoreId, paymentDetails, summary.availableBalance]);

  const canRequestPayout = !requestDisabledReason;

  useEffect(() => {
    if (!showRequestModal) return;
    setCustomRequestAmount(summary.availableBalance > 0 ? String(summary.availableBalance.toFixed(2)) : "");
  }, [showRequestModal, summary.availableBalance]);

  const filteredPayoutRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payoutRequests.filter((row) => {
      if (requestStatusFilter !== "all" && String(row.status || "").toLowerCase() !== requestStatusFilter) return false;
      if (!q) return true;
      return `${row.id} ${row.method} ${row.status} ${row.reference_no}`.toLowerCase().includes(q);
    });
  }, [payoutRequests, query, requestStatusFilter]);

  const transactionRows = useMemo(() => {
    return paymentSessions
      .filter((row) => {
        const normalized = isSuccessfulSession(row) ? "paid" : isCancelledSession(row) ? "cancelled" : "other";
        if (paymentStatusFilter === "paid") return normalized === "paid";
        if (paymentStatusFilter === "cancelled") return normalized === "cancelled";
        return normalized === "paid" || normalized === "cancelled";
      })
      .filter((row) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${row.tracking_id} ${row.payment_provider} ${getSessionStatus(row)}`.toLowerCase().includes(q);
      });
  }, [paymentSessions, paymentStatusFilter, query]);

  const handleRefresh = async () => {
    if (!selectedStoreId) return;
    setRefreshing(true);
    try {
      const [paymentDetailsRes, sessionsRes, payoutReqs] = await Promise.all([
        supabaseBrowser
          .from("store_payment_details")
          .select(
            "store_id,payout_method,settlement_cycle,commission_percent,currency,kyc_status,beneficiary_name,bank_name,account_number,iban,swift,billing_email,billing_phone"
          )
          .eq("store_id", selectedStoreId)
          .maybeSingle(),
        supabaseBrowser
          .from("payment_sessions")
          .select(
            "id,tracking_id,payment_provider,amount_major,original_amount,discount_amount,currency_code,status,gateway_status,created_at,verified_at,discount_source"
          )
          .eq("payment_context", "BILL_PAYMENT")
          .eq("store_id", selectedStoreId)
          .order("created_at", { ascending: false })
          .limit(500),
        loadPayoutRequests(userId, selectedStoreId),
      ]);

      if (paymentDetailsRes.error && !isSchemaError(paymentDetailsRes.error)) throw paymentDetailsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      setPaymentDetails(paymentDetailsRes.data || null);
      setPaymentSessions(sessionsRes.data || []);
      setPayoutRequests(payoutReqs || []);
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to refresh payout data.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!canRequestPayout || requesting || !selectedStoreId || !userId) return;
    const requestedAmount = Math.min(asNumber(customRequestAmount), summary.availableBalance);
    if (requestedAmount <= 0) return;
    try {
      setRequesting(true);
      setError("");
      setSuccessMessage("");

      const created = await createPayoutRequest(
        userId,
        selectedStoreId,
        requestedAmount,
        paymentDetails?.payout_method || "BANK_TRANSFER",
        {
          store_name: selectedStore?.name || "",
          beneficiary_name: paymentDetails?.beneficiary_name || "",
          billing_email: paymentDetails?.billing_email || "",
        }
      );

      setPayoutRequests((prev) => [created, ...prev]);
      setShowRequestModal(false);
      setSuccessMessage(
        `Payout request created for ${selectedStore?.name || "store"}: MUR ${formatMoney(requestedAmount)}.`
      );
    } catch (e) {
      setError(e?.message || "Failed to create payout request.");
    } finally {
      setRequesting(false);
    }
  };

  const handleExport = () => {
    const rows = [
      ["Store Payout Export"],
      ["Generated At", new Date().toLocaleString()],
      ["Store", selectedStore?.name || ""],
      ["Available Balance", summary.availableBalance],
      ["In Transit", summary.inTransit],
      ["Paid Out", summary.paidOut],
      ["Gross Collected", summary.grossCollected],
      ["Net Collected", summary.netCollected],
      ["Discounts Given", summary.discountsGiven],
      [],
      ["Payout Requests"],
      ["Request ID", "Amount", "Method", "Status", "Requested At", "Processed At", "Reference"],
      ...filteredPayoutRequests.map((row) => [
        row.id,
        row.amount,
        row.method,
        row.status,
        row.requested_at,
        row.processed_at,
        row.reference_no,
      ]),
      [],
      ["Transactions"],
      ["Tracking ID", "Date", "Provider", "Gross Amount", "Discount", "Net Amount", "Status"],
      ...transactionRows.map((row) => [
        row.tracking_id || row.id,
        getSessionTimestamp(row),
        row.payment_provider || "",
        asNumber(row.original_amount || row.amount_major),
        asNumber(row.discount_amount),
        asNumber(row.amount_major),
        isCancelledSession(row) ? "Cancelled" : "Paid",
      ]),
    ];

    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `store-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section
          className="rounded-[34px] border px-6 py-6 shadow-sm"
          style={{
            borderColor: THEME_BORDER,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.82) 54%, rgba(119,31,168,0.08) 100%)",
          }}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
                <Wallet className="h-3.5 w-3.5" />
                Store Partner
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedStoreId || ""}
                onChange={(e) => changeStore(e.target.value)}
                className="h-11 min-w-[220px] rounded-full border bg-white px-4 text-sm font-medium text-slate-700 outline-none"
                style={{ borderColor: THEME_BORDER }}
              >
                {(stores || []).map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing || storesLoading || !selectedStoreId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-white px-5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                style={{ borderColor: THEME_BORDER }}
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={loading || storesLoading || !selectedStoreId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-white px-5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                style={{ borderColor: THEME_BORDER }}
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                disabled={loading || requesting || !canRequestPayout}
                title={requestDisabledReason || "Request payout"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: THEME_ACCENT, boxShadow: "0 12px 24px rgba(119, 31, 168, 0.24)" }}
              >
                <CircleDollarSign className="h-4 w-4" />
                Request payout
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Available Balance"
            value={amountNode(summary.availableBalance, true)}
            icon={Wallet}
          />
          <StatCard
            label="Pending Payment"
            value={amountNode(summary.inTransit, true)}
            icon={RefreshCw}
            accent="amber"
          />
          <StatCard
            label="Paid Out"
            value={amountNode(summary.paidOut, true)}
            icon={CheckCircle2}
            accent="green"
          />
          <StatCard
            label="Transactions Paid"
            value={<div className="text-3xl font-semibold text-slate-900">{summary.successful.length}</div>}
            icon={ReceiptText}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card
            title="Settlement Summary"
            subtitle="Breakdown of customer bill payments that contribute to the store payout balance."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Gross collected</div>
                <div className="mt-2">{amountNode(summary.grossCollected)}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Net collected</div>
                <div className="mt-2">{amountNode(summary.netCollected)}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Discounts given</div>
                <div className="mt-2">{amountNode(summary.discountsGiven)}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Cancelled value</div>
                <div className="mt-2">{amountNode(summary.cancelledValue)}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Payout requests</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{payoutRequests.length}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                <div className="text-xs text-slate-500">Selected store</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{selectedStore?.name || "No store selected"}</div>
              </div>
            </div>
          </Card>

          <Card
            title="Payout Account"
            subtitle="Current payout destination for the selected store."
          >
            {paymentDetails ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><CreditCard className="h-3.5 w-3.5" />Method</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{paymentDetails.payout_method || "-"}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><Landmark className="h-3.5 w-3.5" />Beneficiary</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{paymentDetails.beneficiary_name || "Not added"}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />Bank</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{paymentDetails.bank_name || "Not added"}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4" style={{ borderColor: THEME_BORDER }}>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><Wallet className="h-3.5 w-3.5" />Account</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{maskAccount(paymentDetails.account_number || paymentDetails.iban)}</div>
                  </div>
                </div>
                {!canRequestPayout ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Payout requests are currently blocked: {requestDisabledReason}</div> : null}
              </div>
            ) : (
              <EmptyState
                icon={Landmark}
                title="Payout details not configured"
                body="Add bank or payout details in store partner settings before requesting a payout."
              />
            )}
          </Card>
        </div>

        <Card
          title="Payout Requests"
          subtitle="Track request lifecycle from requested to paid."
          right={
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search request id or method"
                  className="h-11 w-full rounded-full border bg-white pl-9 pr-4 text-sm outline-none"
                  style={{ borderColor: THEME_BORDER }}
                />
              </div>
              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className="h-11 rounded-full border bg-white px-4 text-sm outline-none"
                style={{ borderColor: THEME_BORDER }}
              >
                <option value="all">All statuses</option>
                <option value="requested">Requested</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          }
        >
          {loading ? (
            <div className="flex items-center gap-3 py-8 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading payout requests...
            </div>
          ) : filteredPayoutRequests.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500" style={{ borderColor: THEME_BORDER }}>
                    <th className="py-3 pr-4 font-medium">Request</th>
                    <th className="py-3 pr-4 font-medium">Amount</th>
                    <th className="py-3 pr-4 font-medium">Method</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Requested</th>
                    <th className="py-3 pr-0 font-medium">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayoutRequests.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0" style={{ borderColor: "rgba(226,232,240,0.8)" }}>
                      <td className="py-4 pr-4">
                        <div className="font-semibold text-slate-900">{row.id}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.reference_no ? `Ref: ${row.reference_no}` : "No reference yet"}</div>
                      </td>
                      <td className="py-4 pr-4">{amountNode(row.amount)}</td>
                      <td className="py-4 pr-4 text-slate-700">{row.method}</td>
                      <td className="py-4 pr-4"><StatusPill status={row.status} /></td>
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(row.requested_at)}</td>
                      <td className="py-4 pr-0 text-slate-600">{formatDateTime(row.processed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="No payout requests yet"
              body="Once you submit a payout request, it will appear here with its processing status."
            />
          )}
        </Card>

        <Card
          title="Payment Ledger"
          subtitle="Transaction-level bill payments that drive settlement and payout balance."
          right={
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="h-11 rounded-full border bg-white px-4 text-sm outline-none"
              style={{ borderColor: THEME_BORDER }}
            >
              <option value="all">Paid + cancelled</option>
              <option value="paid">Paid only</option>
              <option value="cancelled">Cancelled only</option>
            </select>
          }
        >
          {loading || storesLoading ? (
            <div className="flex items-center gap-3 py-8 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading settlement ledger...
            </div>
          ) : transactionRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500" style={{ borderColor: THEME_BORDER }}>
                    <th className="py-3 pr-4 font-medium">Tracking ID</th>
                    <th className="py-3 pr-4 font-medium">Date</th>
                    <th className="py-3 pr-4 font-medium">Provider</th>
                    <th className="py-3 pr-4 font-medium">Gross</th>
                    <th className="py-3 pr-4 font-medium">Discount</th>
                    <th className="py-3 pr-4 font-medium">Net</th>
                    <th className="py-3 pr-0 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionRows.map((row) => {
                    const isCancelled = isCancelledSession(row);
                    return (
                      <tr key={row.id} className="border-b last:border-b-0" style={{ borderColor: "rgba(226,232,240,0.8)" }}>
                        <td className="py-4 pr-4">
                          <div className="font-semibold text-slate-900">{row.tracking_id || String(row.id).slice(0, 8).toUpperCase()}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.currency_code || "MUR"}</div>
                        </td>
                        <td className="py-4 pr-4 text-slate-600">{formatDateTime(getSessionTimestamp(row))}</td>
                        <td className="py-4 pr-4 text-slate-700">{row.payment_provider || "-"}</td>
                        <td className="py-4 pr-4">{amountNode(asNumber(row.original_amount || row.amount_major))}</td>
                        <td className="py-4 pr-4">{amountNode(asNumber(row.discount_amount))}</td>
                        <td className="py-4 pr-4">{amountNode(asNumber(row.amount_major))}</td>
                        <td className="py-4 pr-0">
                          <StatusPill status={isCancelled ? "Cancelled" : "Paid"} tone="payment" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No payment ledger entries"
              body="Paid and cancelled bill payments for the selected store will appear here."
            />
          )}
        </Card>
      </div>

      <RequestPayoutModal
        open={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onConfirm={handleRequestPayout}
        requesting={requesting}
        storeName={selectedStore?.name || ""}
        maxAmount={summary.availableBalance}
        customAmount={customRequestAmount}
        onCustomAmountChange={setCustomRequestAmount}
        method={paymentDetails?.payout_method || "BANK_TRANSFER"}
        gross={summary.grossCollected}
        paidOut={summary.paidOut}
        inTransit={summary.inTransit}
      />
    </div>
  );
}
