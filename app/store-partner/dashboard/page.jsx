"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  CircleDollarSign,
  ReceiptText,
  ChevronDown,
  Check,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/lib/store-partner/useDashboard";
import { useStores } from "@/lib/store-partner/useStores";

const THEME_BG = "#F4E7D1";
const THEME_ACCENT = "#771FA899";
const THEME_ACCENT_SOLID = "#771FA8";

function StatCard({ title, value, change, changeType, icon: Icon }) {
  const up = changeType === "up";
  const down = changeType === "down";

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">{title}</div>
        <div
          className="h-10 w-10 rounded-2xl border flex items-center justify-center"
          style={{
            background: THEME_BG,
            borderColor: THEME_ACCENT,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: THEME_ACCENT_SOLID }} />
        </div>
      </div>

      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>

      <div className="mt-3 flex items-center gap-1 text-sm">
        {up && <ArrowUpRight className="h-4 w-4" style={{ color: THEME_ACCENT_SOLID }} />}
        {down && <ArrowDownRight className="h-4 w-4 text-red-600" />}
        <span
          className={[
            "font-medium",
            up ? "text-emerald-600" : down ? "text-red-600" : "text-gray-600",
          ].join(" ")}
        >
          {change}
        </span>
        <span className="text-gray-500">vs last 7 days</span>
      </div>
    </div>
  );
}

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

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "delivered" ||
    s === "completed" ||
    s === "paid" ||
    s === "verified success" ||
    s === "finalized"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "preparing" || s === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : s === "cancelled" || s === "failed" || s === "verified failed" || s === "error"
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
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      </div>
      <SkeletonBlock className="h-6 w-24" />
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-20" />
    </div>
  );
}

function toCsvCell(value) {
  const safe = String(value ?? "").replace(/"/g, '""');
  return `"${safe}"`;
}

function formatCurrency(value) {
  return `MUR ${Number(value || 0).toLocaleString()}`;
}

function GraphRangeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const options = [
    { value: "7d", label: "Last Week" },
    { value: "30d", label: "Last Month" },
    { value: "month", label: "Specific Month" },
    { value: "custom", label: "Custom Dates" },
  ];

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group inline-flex h-11 min-w-[190px] items-center justify-between rounded-2xl border px-4 text-sm font-semibold text-gray-800 shadow-sm transition-all"
        style={{
          background: `linear-gradient(135deg, ${THEME_BG} 0%, #fffaf2 100%)`,
          borderColor: THEME_ACCENT,
          boxShadow: `0 10px 30px -18px ${THEME_ACCENT}`,
        }}
      >
        <span>{selected.label}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: THEME_ACCENT_SOLID }}
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+10px)] z-20 min-w-[220px] overflow-hidden rounded-2xl border bg-white p-2 shadow-2xl"
          style={{
            borderColor: THEME_ACCENT,
            boxShadow: `0 24px 50px -24px ${THEME_ACCENT}`,
          }}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
                style={{
                  background: active ? THEME_BG : "#ffffff",
                  color: active ? THEME_ACCENT_SOLID : "#1f2937",
                }}
              >
                <span>{option.label}</span>
                {active ? <Check className="h-4 w-4" style={{ color: THEME_ACCENT_SOLID }} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getTodayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthValue() {
  return getTodayInputValue().slice(0, 7);
}

function visibleXAxisLabel(index, length, label) {
  if (!label) return "";
  if (length <= 8) return label;
  if (length <= 14) return index % 2 === 0 ? label : "";
  if (length <= 21) return index % 3 === 0 ? label : "";
  return index % 5 === 0 || index === length - 1 ? label : "";
}

function SalesOverviewChart({ data }) {
  const width = 1200;
  const height = 260;
  const padX = 24;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const points = data.map((d, i) => {
    const x =
      data.length <= 1 ? width / 2 : padX + (i * innerW) / (data.length - 1);
    const y = padY + ((max - d.value) / range) * innerH;
    return { x, y, label: d.label, value: d.value };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${points[0].x} ${height - padY} L ${points
    .map((p) => `${p.x} ${p.y}`)
    .join(" L ")} L ${points[points.length - 1].x} ${height - padY} Z`;

  const gridY = [0, 0.25, 0.5, 0.75, 1].map(
    (step) => padY + step * innerH
  );

  return (
    <div className="h-[260px] rounded-2xl border border-gray-200 bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <defs>
          <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={THEME_ACCENT_SOLID} stopOpacity="0.28" />
            <stop offset="100%" stopColor={THEME_BG} stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {gridY.map((y, idx) => (
          <line
            key={idx}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke={idx === gridY.length - 1 ? THEME_ACCENT : "#ebe7df"}
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill="url(#salesGradient)" />
        <polyline
          points={polyline}
          fill="none"
          stroke={THEME_ACCENT_SOLID}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, idx) => (
          <g key={idx}>
            <text
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#7c6f62"
            >
              {visibleXAxisLabel(idx, points.length, p.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function StorePartnerDashboardPage() {
  const router = useRouter();
  const [graphMode, setGraphMode] = useState("30d");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [startDate, setStartDate] = useState(getTodayInputValue);
  const [endDate, setEndDate] = useState(getTodayInputValue);
  const [expandedTransactionCountByStore, setExpandedTransactionCountByStore] = useState({});

  const dashboardFilters = useMemo(
    () => ({
      mode: graphMode,
      month: selectedMonth,
      startDate,
      endDate,
    }),
    [graphMode, selectedMonth, startDate, endDate]
  );

  const {
    loading: storesLoading,
    selectedStoreId,
    selectedStore,
    error: storesError,
  } = useStores();
  const {
    loading: dashboardLoading,
    kpis,
    activity,
    error: dashboardError,
  } = useDashboard(selectedStoreId, dashboardFilters);

  const loading = storesLoading || dashboardLoading;
  const dashboardErrorMessage = storesError || dashboardError || "";

  const recentPayments = activity || [];
  const visibleTransactionCount = expandedTransactionCountByStore[selectedStoreId] || 10;
  const visiblePayments = recentPayments.slice(0, visibleTransactionCount);

  const handleSeeMorePayments = () => {
    if (visibleTransactionCount < 20) {
      setExpandedTransactionCountByStore((prev) => ({
        ...prev,
        [selectedStoreId]: 20,
      }));
      return;
    }

    router.push("/store-partner/payouts");
  };

  const stats = useMemo(
    () => [
      {
        title: "Bills Paid",
        value: String(kpis?.billsPaid ?? 0),
        change: kpis?.billsPaidDelta?.change || "0%",
        changeType: kpis?.billsPaidDelta?.changeType || "neutral",
        icon: CreditCard,
      },
      {
        title: "Revenue",
        value: formatCurrency(kpis?.revenueCollected ?? 0),
        change: kpis?.revenueCollectedDelta?.change || "0%",
        changeType: kpis?.revenueCollectedDelta?.changeType || "neutral",
        icon: CircleDollarSign,
      },
      {
        title: "Cancelled Payments",
        value: String(kpis?.cancelledPayments ?? 0),
        change: kpis?.cancelledPaymentsDelta?.change || "0%",
        changeType: kpis?.cancelledPaymentsDelta?.changeType || "neutral",
        icon: ReceiptText,
      },
    ],
    [kpis]
  );

  const salesChartData = kpis?.salesTrend?.length
    ? kpis.salesTrend
    : Array.from({ length: 30 }, () => ({
        label: "",
        value: 0,
      }));

  const handleExport = () => {
    const rows = [];

    rows.push(["Dashboard Stats"]);
    rows.push(["Metric", "Value", "Change"]);
    stats.forEach((s) => rows.push([s.title, s.value, s.change]));

    rows.push([]);
    rows.push(["Recent Payments"]);
    rows.push([
      "Payment ID",
      "Date",
      "Method",
      "Discount Applied",
      "Discount Amount",
      "Original Amount",
      "Final Amount",
      "Status",
    ]);
    recentPayments.forEach((p) =>
      rows.push([
        p.id,
        p.date,
        p.method,
        p.discountApplied ? "Yes" : "No",
        `${p.currencyCode} ${Number(p.discountAmount || 0).toLocaleString()}`,
        `${p.currencyCode} ${Number(p.originalAmount || 0).toLocaleString()}`,
        `${p.currencyCode} ${Number(p.finalAmount || 0).toLocaleString()}`,
        p.status,
      ])
    );

    const csv = rows
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    const a = document.createElement("a");
    a.href = url;
    a.download = `store-partner-dashboard-${date}.csv`;
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
          <div>
            {selectedStore?.name ? (
              <div className="text-sm text-gray-500">
                Live metrics for <span className="font-semibold text-gray-900">{selectedStore.name}</span>
              </div>
            ) : null}
            {dashboardErrorMessage ? (
              <div className="mt-1 text-sm text-red-600">{dashboardErrorMessage}</div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
              type="button"
              onClick={handleExport}
            >
              Export
            </button>

            <Link
              href="/store-partner/offers"
              className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-[rgba(119,31,168,0.28)]"
              style={{
                background:
                  "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
              }}
            >
              <Sparkles className="h-4 w-4" />
              Create Offer
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {loading ? (
            <>
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
            </>
          ) : (
            stats.map((s) => <StatCard key={s.title} {...s} />)
          )}
        </div>

        <div>
          <div className="xl:col-span-2">
            <CardShell
              title="Sales Overview"
              right={
                <div className="text-xs text-gray-500 inline-flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Daily sales trend
                </div>
              }
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <GraphRangeSelect value={graphMode} onChange={setGraphMode} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {graphMode === "month" ? (
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="h-11 rounded-2xl border px-3 text-sm font-medium text-gray-700 shadow-sm outline-none"
                      style={{
                        background: "#fffaf5",
                        borderColor: THEME_ACCENT,
                        boxShadow: `0 10px 24px -20px ${THEME_ACCENT}`,
                      }}
                    />
                  ) : null}

                  {graphMode === "custom" ? (
                    <>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-11 rounded-2xl border px-3 text-sm font-medium text-gray-700 shadow-sm outline-none"
                        style={{
                          background: "#fffaf5",
                          borderColor: THEME_ACCENT,
                          boxShadow: `0 10px 24px -20px ${THEME_ACCENT}`,
                        }}
                      />
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-11 rounded-2xl border px-3 text-sm font-medium text-gray-700 shadow-sm outline-none"
                        style={{
                          background: "#fffaf5",
                          borderColor: THEME_ACCENT,
                          boxShadow: `0 10px 24px -20px ${THEME_ACCENT}`,
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <SkeletonBlock className="h-[260px]" />
              ) : (
                <SalesOverviewChart data={salesChartData} />
              )}

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {loading ? (
                  <>
                    <SkeletonBlock className="h-20" />
                    <SkeletonBlock className="h-20" />
                    <SkeletonBlock className="h-20" />
                    <SkeletonBlock className="h-20" />
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">Today</div>
                      <div className="font-semibold">
                        {formatCurrency(kpis?.todayRevenue ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">This Week</div>
                      <div className="font-semibold">
                        {formatCurrency(kpis?.thisWeekRevenue ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">Discounted Bills</div>
                      <div className="font-semibold">
                        {String(kpis?.discountedBills ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">Discounts Given</div>
                      <div className="font-semibold">
                        {formatCurrency(kpis?.discountsGiven ?? 0)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardShell>
          </div>
        </div>

        <CardShell
          title="Recent Payments"
          right={
            recentPayments.length > 10 ? (
              <button
                type="button"
                onClick={handleSeeMorePayments}
                className="h-9 rounded-full px-4 text-sm font-semibold"
                style={{
                  background: THEME_BG,
                  border: `1px solid ${THEME_ACCENT}`,
                  color: THEME_ACCENT_SOLID,
                }}
              >
                {visibleTransactionCount < 20 ? "See more" : "More"}
              </button>
            ) : null
          }
        >
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Payment ID</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-4 font-medium">Discount</th>
                    <th className="py-2 pr-4 font-medium">Discount Amt</th>
                    <th className="py-2 pr-4 font-medium">Real Amt</th>
                    <th className="py-2 pr-4 font-medium">After Discount</th>
                    <th className="py-2 pr-0 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.length ? (
                    visiblePayments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                      >
                        <td className="py-3 pr-4 font-semibold text-gray-900">
                          {p.id}
                        </td>
                        <td className="py-3 pr-4 text-gray-700">{p.date}</td>
                        <td className="py-3 pr-4 text-gray-700">{p.method}</td>
                        <td className="py-3 pr-4">
                          <span
                            className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                            style={{
                              background: p.discountApplied ? THEME_BG : "#f9fafb",
                              borderColor: p.discountApplied ? THEME_ACCENT : "#e5e7eb",
                              color: p.discountApplied ? THEME_ACCENT_SOLID : "#6b7280",
                            }}
                          >
                            {p.discountApplied ? "Applied" : "None"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-700">
                          {`${p.currencyCode} ${Number(p.discountAmount || 0).toLocaleString()}`}
                        </td>
                        <td className="py-3 pr-4 text-gray-700">
                          {`${p.currencyCode} ${Number(p.originalAmount || 0).toLocaleString()}`}
                        </td>
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {`${p.currencyCode} ${Number(p.finalAmount || 0).toLocaleString()}`}
                        </td>
                        <td className="py-3 pr-0">
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-gray-100">
                      <td className="py-6 text-center text-sm text-gray-500" colSpan={8}>
                        No payments found for this store yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      </div>
    </div>
  );
}
