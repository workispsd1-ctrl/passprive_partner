import { supabaseBrowser } from "@/lib/supabaseBrowser";

const SUCCESS_STATUSES = new Set(["PAID"]);
const CANCELLED_STATUSES = new Set(["CANCELLED", "REJECTED"]);
function asNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(dateLike, days) {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + days);
  return d;
}

function formatChartLabel(dateLike) {
  return new Date(dateLike).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function toIsoDay(value) {
  const date = new Date(value || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinRange(dateValue, start, end) {
  const ts = new Date(dateValue || 0).getTime();
  return Number.isFinite(ts) && ts >= start && ts < end;
}

function formatDelta(current, previous) {
  if (!previous && !current) {
    return { change: "0%", changeType: "neutral" };
  }

  if (!previous) {
    return { change: "+100%", changeType: "up" };
  }

  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct).toFixed(1);

  if (pct > 0) return { change: `+${rounded}%`, changeType: "up" };
  if (pct < 0) return { change: `-${rounded}%`, changeType: "down" };
  return { change: "0%", changeType: "neutral" };
}

function getNormalizedStatus(row) {
  return String(row?.payment_status || row?.status || "").toUpperCase();
}

function isSuccessfulSession(row) {
  return SUCCESS_STATUSES.has(getNormalizedStatus(row));
}

function isCancelledSession(row) {
  return CANCELLED_STATUSES.has(getNormalizedStatus(row));
}

function getSessionTimestamp(row) {
  return row.delivered_at || row.accepted_at || row.created_at;
}

function getRangeConfig(filters) {
  const now = new Date();
  const mode = filters?.mode || "30d";

  if (mode === "7d") {
    const start = startOfDay(addDays(now, -6));
    const end = addDays(startOfDay(now), 1);
    return { mode, start, end };
  }

  if (mode === "month" && filters?.month) {
    const [year, month] = String(filters.month).split("-").map(Number);
    const start = new Date(year, (month || 1) - 1, 1);
    const end = new Date(year, month || 1, 1);
    return { mode, start, end };
  }

  if (mode === "custom" && filters?.startDate && filters?.endDate) {
    const start = startOfDay(filters.startDate);
    const end = addDays(startOfDay(filters.endDate), 1);
    return start < end
      ? { mode, start, end }
      : { mode: "30d", start: startOfDay(addDays(now, -29)), end: addDays(startOfDay(now), 1) };
  }

  const start = startOfDay(addDays(now, -29));
  const end = addDays(startOfDay(now), 1);
  return { mode: "30d", start, end };
}

async function fetchStoreOrders(storeId) {
  if (!storeId) return [];

  const { data, error } = await supabaseBrowser
    .from("store_orders")
    .select(
      "id,order_no,store_id,customer_name,total_amount,subtotal,discount_amount,payment_method,payment_status,status,created_at,accepted_at,delivered_at,service_type,order_flow"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function buildDailyTrend(rows, start, end) {
  const revenueByDay = new Map();
  let cursor = new Date(start);

  while (cursor < end) {
    revenueByDay.set(toIsoDay(cursor), 0);
    cursor = addDays(cursor, 1);
  }

  rows.forEach((row) => {
    const key = toIsoDay(getSessionTimestamp(row));
    if (!revenueByDay.has(key)) return;
    revenueByDay.set(key, revenueByDay.get(key) + asNumber(row.amount_major));
  });

  return Array.from(revenueByDay.entries()).map(([isoDay, value]) => ({
    label: formatChartLabel(isoDay),
    value,
  }));
}

export async function fetchDashboardKPIs(storeId, filters) {
  if (!storeId) return emptyKPIs();

  const rows = await fetchStoreOrders(storeId);
  const now = Date.now();
  const todayStart = startOfDay(now);
  const thisWeekStart = startOfDay(addDays(todayStart, -6));

  const { start, end } = getRangeConfig(filters);
  const rangeMs = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - rangeMs);

  const successfulRows = rows.filter(isSuccessfulSession);
  const cancelledRows = rows.filter(isCancelledSession);
  const rangeRows = successfulRows.filter((row) =>
    isWithinRange(getSessionTimestamp(row), start.getTime(), end.getTime())
  );
  const previousRangeRows = successfulRows.filter((row) =>
    isWithinRange(getSessionTimestamp(row), previousStart.getTime(), start.getTime())
  );
  const rangeCancelledRows = cancelledRows.filter((row) =>
    isWithinRange(getSessionTimestamp(row), start.getTime(), end.getTime())
  );
  const previousRangeCancelledRows = cancelledRows.filter((row) =>
    isWithinRange(getSessionTimestamp(row), previousStart.getTime(), start.getTime())
  );

  const revenueCollected = successfulRows.reduce(
    (sum, row) => sum + asNumber(row.total_amount),
    0
  );
  const rangeRevenue = rangeRows.reduce((sum, row) => sum + asNumber(row.total_amount), 0);
  const previousRangeRevenue = previousRangeRows.reduce(
    (sum, row) => sum + asNumber(row.total_amount),
    0
  );

  const todayRevenue = successfulRows
    .filter((row) => isWithinRange(getSessionTimestamp(row), todayStart.getTime(), now))
    .reduce((sum, row) => sum + asNumber(row.total_amount), 0);

  const thisWeekRevenue = successfulRows
    .filter((row) => isWithinRange(getSessionTimestamp(row), thisWeekStart.getTime(), now))
    .reduce((sum, row) => sum + asNumber(row.total_amount), 0);

  const discountsGiven = rangeRows.reduce(
    (sum, row) => sum + asNumber(row.discount_amount),
    0
  );
  const discountedBills = rangeRows.filter((row) => asNumber(row.discount_amount) > 0).length;

  return {
    billsPaid: successfulRows.length,
    billsPaidDelta: formatDelta(rangeRows.length, previousRangeRows.length),
    revenueCollected,
    revenueCollectedDelta: formatDelta(rangeRevenue, previousRangeRevenue),
    cancelledPayments: cancelledRows.length,
    cancelledPaymentsDelta: formatDelta(
      rangeCancelledRows.length,
      previousRangeCancelledRows.length
    ),
    billsInPeriod: rangeRows.length,
    billsInPeriodDelta: formatDelta(rangeRows.length, previousRangeRows.length),
    todayRevenue,
    thisWeekRevenue,
    discountsGiven,
    discountedBills,
    salesTrend: buildDailyTrend(rangeRows, start, end),
  };
}

export async function fetchRecentActivity(storeId) {
  const rows = await fetchStoreOrders(storeId);

  return rows
    .filter((row) => isSuccessfulSession(row) || isCancelledSession(row))
    .slice(0, 50)
    .map((row) => ({
    id: row.order_no || String(row.id).slice(0, 8).toUpperCase(),
    date: new Date(getSessionTimestamp(row)).toLocaleDateString("en-GB"),
    currencyCode: "MUR",
    originalAmount: asNumber(row.subtotal || row.total_amount),
    discountAmount: asNumber(row.discount_amount),
    finalAmount: asNumber(row.total_amount),
    discountApplied: asNumber(row.discount_amount) > 0,
    method: row.payment_method || "N/A",
    status: isCancelledSession(row) ? "Cancelled" : "Paid",
  }));
}

function emptyKPIs() {
  return {
    billsPaid: 0,
    billsPaidDelta: { change: "0%", changeType: "neutral" },
    revenueCollected: 0,
    revenueCollectedDelta: { change: "0%", changeType: "neutral" },
    cancelledPayments: 0,
    cancelledPaymentsDelta: { change: "0%", changeType: "neutral" },
    billsInPeriod: 0,
    billsInPeriodDelta: { change: "0%", changeType: "neutral" },
    todayRevenue: 0,
    thisWeekRevenue: 0,
    discountsGiven: 0,
    discountedBills: 0,
    salesTrend: Array.from({ length: 30 }, () => ({
      label: "",
      value: 0,
    })),
  };
}
