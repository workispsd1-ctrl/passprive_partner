
"use client";

import { useState } from "react";

export default function RestaurantDashboardPage() {
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div />
        {/* Date Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 outline-none"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 days</option>
            <option value="custom">Custom date</option>
          </select>

          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"
              />
              <span className="text-sm text-gray-500">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Revenue" value="₹ 1,24,500" meta="+12% vs yesterday" />
        <KpiCard title="Bookings" value="48" meta="+6% vs yesterday" />
        <KpiCard title="Cancellations" value="3" meta="-2% vs yesterday" />
        <KpiCard title="Rating" value="4.6" meta="+0.1 this week" />
      </div>

      {/* Middle Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Performance */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Performance</div>
              <div className="text-xs text-gray-500">
                {range === "today"
                  ? "Today"
                  : range === "yesterday"
                  ? "Yesterday"
                  : range === "week"
                  ? "Last 7 days"
                  : "Custom range"}
              </div>
            </div>

            <button
              type="button"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              View report
            </button>
          </div>

          {/* Chart placeholder */}
          <div className="mt-4 h-64 rounded-xl border border-gray-200 bg-gray-50" />

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "var(--accent)" }}
              />
              Revenue
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              Bookings
            </div>
          </div>
        </div>

        {/* Pending actions */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Pending actions</div>
            <button
              type="button"
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              View all
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <ActionCard
              title="2 reviews need reply"
              subtitle="Respond to improve trust"
              chip="Reviews"
            />
            <ActionCard
              title="Update opening hours"
              subtitle="Holiday timings pending"
              chip="Hours"
            />
            <ActionCard
              title="Low stock on 3 items"
              subtitle="Mark unavailable in menu"
              chip="Menu"
            />
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Booking timeline */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                Next 2 hours bookings
              </div>
              <div className="text-xs text-gray-500">
                Quick view of upcoming reservations
              </div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Open bookings
            </button>
          </div>

          <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 overflow-hidden">
            <TimelineRow
              time="7:00 PM"
              name="Rohit Sharma"
              guests="2 guests"
              status="Confirmed"
            />
            <TimelineRow
              time="7:30 PM"
              name="Ananya Singh"
              guests="4 guests"
              status="Confirmed"
            />
            <TimelineRow
              time="8:00 PM"
              name="Karan Mehta"
              guests="3 guests"
              status="Pending"
            />
            <TimelineRow
              time="8:30 PM"
              name="Neha Patel"
              guests="2 guests"
              status="Confirmed"
            />
          </div>
        </div>

        {/* Recent reviews */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Recent reviews</div>
            <button
              type="button"
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              View all
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <ReviewCard
              name="Sahil"
              rating="5.0"
              text="Great ambience and fast service. Loved the starters!"
            />
            <ReviewCard
              name="Meera"
              rating="4.5"
              text="Food was amazing. Slight delay but worth it."
            />
            <ReviewCard
              name="Amit"
              rating="4.0"
              text="Good experience overall. Will visit again."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
   SMALL INTERNAL COMPONENTS
------------------------------ */

function KpiCard({ title, value, meta }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-2 text-xs text-gray-500">{meta}</div>

      <div
        className="mt-4 h-1.5 w-16 rounded-full"
        style={{ backgroundColor: "var(--accent)" }}
      />
    </div>
  );
}

function ActionCard({ title, subtitle, chip }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold border"
          style={{
            borderColor: "rgba(197, 157, 95, 0.35)",
            backgroundColor: "rgba(197, 157, 95, 0.12)",
            color: "#8A6B2B",
          }}
        >
          {chip}
        </span>
      </div>
    </div>
  );
}

function TimelineRow({ time, name, guests, status }) {
  const isConfirmed = status === "Confirmed";

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="w-20 text-sm font-semibold text-gray-900">{time}</div>

      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900">{name}</div>
        <div className="text-xs text-gray-600">{guests}</div>
      </div>

      <span
        className="rounded-full px-3 py-1 text-xs font-semibold border"
        style={{
          borderColor: isConfirmed
            ? "rgba(34,197,94,.25)"
            : "rgba(245,158,11,.25)",
          backgroundColor: isConfirmed
            ? "rgba(34,197,94,.10)"
            : "rgba(245,158,11,.10)",
          color: isConfirmed ? "#166534" : "#92400e",
        }}
      >
        {status}
      </span>
    </div>
  );
}

function ReviewCard({ name, rating, text }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{name}</div>
        <div
          className="text-xs font-semibold px-2 py-1 rounded-full border"
          style={{
            borderColor: "rgba(197, 157, 95, 0.35)",
            backgroundColor: "rgba(197, 157, 95, 0.12)",
            color: "#8A6B2B",
          }}
        >
          ★ {rating}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-700 leading-relaxed">{text}</div>
    </div>
  );
}
