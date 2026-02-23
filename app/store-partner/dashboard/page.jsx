"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Package,
  Wallet,
  Users,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

function StatCard({ title, value, change, changeType, icon: Icon }) {
  const up = changeType === "up";
  const down = changeType === "down";

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">{title}</div>
        <div className="h-10 w-10 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-800" />
        </div>
      </div>

      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>

      <div className="mt-3 flex items-center gap-1 text-sm">
        {up && <ArrowUpRight className="h-4 w-4 text-emerald-600" />}
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
    s === "delivered" || s === "completed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "preparing" || s === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : s === "cancelled" || s === "failed"
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

function SalesOverviewChart({ data }) {
  const width = 760;
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
    const x = padX + (i * innerW) / (data.length - 1);
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
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridY.map((y, idx) => (
          <line
            key={idx}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill="url(#salesGradient)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke="#f97316" strokeWidth="2" />
            <text
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function StorePartnerDashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900); // demo delay
    return () => clearTimeout(t);
  }, []);

  const recentPayments = useMemo(
    () => [
      {
        id: "PAY-1001",
        date: "2026-02-19",
        amount: "MUR 2,500",
        method: "Card",
        status: "Completed",
      },
      {
        id: "PAY-1000",
        date: "2026-02-18",
        amount: "MUR 1,200",
        method: "Cash",
        status: "Completed",
      },
      {
        id: "PAY-0999",
        date: "2026-02-17",
        amount: "MUR 3,000",
        method: "UPI",
        status: "Pending",
      },
      {
        id: "PAY-0998",
        date: "2026-02-16",
        amount: "MUR 1,800",
        method: "Card",
        status: "Failed",
      },
    ],
    []
  );

  const stats = useMemo(
    () => [
      {
        title: "Pick and Collect",
        value: "128",
        change: "+12.4%",
        changeType: "up",
        icon: ShoppingBag,
      },
      {
        title: "Revenue",
        value: "MUR 84,920",
        change: "+7.1%",
        changeType: "up",
        icon: Wallet,
      },
      {
        title: "Products",
        value: "312",
        change: "+3 added",
        changeType: "neutral",
        icon: Package,
      },
      {
        title: "Customers",
        value: "1,042",
        change: "-1.6%",
        changeType: "down",
        icon: Users,
      },
    ],
    []
  );

  const recentOrders = useMemo(
    () => [
      {
        id: "ORD-10291",
        customer: "Aarav",
        total: "MUR 890",
        status: "Delivered",
        time: "2h ago",
      },
      {
        id: "ORD-10288",
        customer: "Riya",
        total: "MUR 1,120",
        status: "Preparing",
        time: "4h ago",
      },
      {
        id: "ORD-10273",
        customer: "Kiran",
        total: "MUR 640",
        status: "Cancelled",
        time: "Yesterday",
      },
      {
        id: "ORD-10252",
        customer: "Sofia",
        total: "MUR 1,990",
        status: "Delivered",
        time: "2 days ago",
      },
    ],
    []
  );

  const topProducts = useMemo(
    () => [
      { name: "Premium Chocolate Box", sold: 46, revenue: "MUR 9,200" },
      { name: "Gift Hamper Deluxe", sold: 31, revenue: "MUR 12,400" },
      { name: "Organic Honey 500g", sold: 28, revenue: "MUR 5,600" },
      { name: "Instant Coffee Pack", sold: 22, revenue: "MUR 3,960" },
    ],
    []
  );

  const salesChartData = useMemo(
    () => [
      { label: "Day 1", value: 5200 },
      { label: "Day 5", value: 6800 },
      { label: "Day 10", value: 6100 },
      { label: "Day 15", value: 7900 },
      { label: "Day 20", value: 7400 },
      { label: "Day 25", value: 8600 },
      { label: "Day 30", value: 9300 },
    ],
    []
  );

  const handleExport = () => {
    const rows = [];

    rows.push(["Dashboard Stats"]);
    rows.push(["Metric", "Value", "Change"]);
    stats.forEach((s) => rows.push([s.title, s.value, s.change]));

    rows.push([]);
    rows.push(["Recent Pick and Collect"]);
    rows.push(["Order", "Customer", "Total", "Status", "Time"]);
    recentOrders.forEach((o) =>
      rows.push([o.id, o.customer, o.total, o.status, o.time])
    );

    rows.push([]);
    rows.push(["Recent Payments"]);
    rows.push(["Payment ID", "Date", "Amount", "Method", "Status"]);
    recentPayments.forEach((p) =>
      rows.push([p.id, p.date, p.amount, p.method, p.status])
    );

    rows.push([]);
    rows.push(["Top Products"]);
    rows.push(["Product", "Sold", "Revenue"]);
    topProducts.forEach((p) => rows.push([p.name, p.sold, p.revenue]));

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
          <div></div>

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
              className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-orange-200"
              style={{
                background:
                  "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
              }}
            >
              <Sparkles className="h-4 w-4" />
              Create Offer
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonBlock className="h-24" />
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
                  Last 30 days
                </div>
              }
            >
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
                      <div className="font-semibold">MUR 12,300</div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">This Week</div>
                      <div className="font-semibold">MUR 84,920</div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">Avg Order</div>
                      <div className="font-semibold">MUR 740</div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                      <div className="text-xs text-gray-500">Conversion</div>
                      <div className="font-semibold">3.2%</div>
                    </div>
                  </>
                )}
              </div>
            </CardShell>
          </div>
        </div>

        <CardShell
          title="Recent Pick and Collect"
          right={
            <button
              className="h-9 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50"
              type="button"
            >
              View All
            </button>
          }
        >
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Order</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-0 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="py-3 pr-4 font-semibold text-gray-900">
                        {o.id}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{o.customer}</td>
                      <td className="py-3 pr-4 text-gray-700">{o.total}</td>
                      <td className="py-3 pr-4">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="py-3 pr-0 text-gray-500">{o.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>

        <CardShell title="Recent Payments">
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
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-0 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="py-3 pr-4 font-semibold text-gray-900">
                        {p.id}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{p.date}</td>
                      <td className="py-3 pr-4 text-gray-700">{p.amount}</td>
                      <td className="py-3 pr-4 text-gray-700">{p.method}</td>
                      <td className="py-3 pr-0">
                        <StatusPill status={p.status} />
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
