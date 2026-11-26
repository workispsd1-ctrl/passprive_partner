import { closingReport } from "@/lib/server/closingReport";
import { mauritiusDayRange } from "@/lib/server/billHistory";
import {
  bookingStats,
  compareTotals,
  isPaidTable,
  loadSales,
  pickupStats,
  previousPeriod,
  serviceStats,
  statsMenu,
  tillStats,
  voidSummary,
  accountPayments,
} from "@/lib/server/tillStats";

export const mauritiusDate = (iso) => new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function buildTillStats(admin, restaurantId, { start, end, from, to, scope }) {
  const prev = previousPeriod(from, to);
  const prevFrom = mauritiusDayRange(prev.from);
  const prevTo = mauritiusDayRange(prev.to);
  const tableNos = scope?.tableNos || null;
  const [{ tables, sales }, bookingRes, collectRes, menuRes, previous] = await Promise.all([
    loadSales(admin, restaurantId, start, end, tableNos),
    admin
      .from("restaurant_bookings")
      .select("status,party_size,source,payment_amount,payment_status,cover_charge_amount")
      .eq("restaurant_id", restaurantId)
      .gte("booking_date", from)
      .lte("booking_date", to)
      .limit(5000),
    admin
      .from("restaurant_orders")
      .select("order_status,total_amount,accepted_at,ready_at,picked_up_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start)
      .lt("created_at", end)
      .limit(5000),
    admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle(),
    prevFrom && prevTo ? loadSales(admin, restaurantId, prevFrom.start, prevTo.end, tableNos).catch(() => null) : null,
  ]);
  const accountRes = tableNos
    ? { data: [] }
    : await admin
        .from("customer_account_payments")
        .select("amount, method")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(5000);
  if (accountRes.error) throw accountRes.error;
  if (bookingRes.error) throw bookingRes.error;
  if (collectRes.error) throw collectRes.error;

  const live = (status) => String(status || "").toUpperCase() !== "CANCELLED";
  const stats = tillStats(sales, tables.map((r) => voidSummary(r, start, end)), statsMenu(menuRes.data?.menu_json));
  const before = previous ? tillStats(previous.sales).journal : null;
  const compare = before ? compareTotals(stats.journal, { from: prev.from, to: prev.to, total: before.total, bills: before.bills, average: before.average }) : null;
  const full = {
    ...stats,
    compare,
    bookings: bookingStats(bookingRes.data || []),
    collect: pickupStats(collectRes.data || []),
    service: serviceStats(tables.filter((r) => isPaidTable(r) && live(r.booking_status)), stats.hours),
    account_payments: accountPayments(accountRes.data || []),
  };
  return { full, tables, sales };
}

export async function buildReport(admin, restaurantId, built, { start, end, from, to, lang = "fr", userId = null, area = null }) {
  const { full, tables, sales } = built;
  const ids = [...new Set([...(full.payers || []).map((u) => u.id), ...(full.sellers || []).map((u) => u.id), userId].filter((id) => id && id !== "unknown"))];
  const [{ data: people }, { data: merchant }] = await Promise.all([
    ids.length ? admin.from("users").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] }),
    admin.from("restaurants").select("name, full_address, phone").eq("id", restaurantId).maybeSingle(),
  ]);
  const names = Object.fromEntries((people || []).map((u) => [u.id, u.full_name || ""]));
  const inPeriod = (at) => at && new Date(at) >= new Date(start) && new Date(at) < new Date(end);
  const refunds = tables.reduce((n, r) => n + (Array.isArray(r.order_details?.reopened) ? r.order_details.reopened.filter((x) => inPeriod(x.at)).length : 0), 0);
  const report = closingReport(full, { from, to, lang, merchant, names, refunds, printedBy: names[userId] || null, area, sales });
  return { report, merchant };
}
