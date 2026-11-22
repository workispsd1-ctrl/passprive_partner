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
  statsReport,
  tillStats,
  voidSummary,
} from "@/lib/server/tillStats";
import { activePrinters, mainPrinter, queueReceiptJob } from "@/lib/server/printJobs";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { scopeForTill } from "@/lib/server/tillArea";

const NO_ACCESS = /waiter|bearer|kitchen/;
const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const { admin, restaurantId } = ctx;

    const body = await readJson(request);
    const from = mauritiusDayRange(body.from);
    const to = mauritiusDayRange(body.to);
    if (!from || !to || to.end <= from.start) return reply({ ok: false, error: "invalid_date" }, 400);
    if ((new Date(to.end) - new Date(from.start)) / DAY_MS > MAX_DAYS) {
      return reply({ ok: false, error: "range_too_long" }, 400);
    }
    const scope = await scopeForTill(admin, ctx, body.area_id);
    const { start } = from;
    const { end } = to;

    const prev = previousPeriod(body.from, body.to);
    const prevFrom = mauritiusDayRange(prev.from);
    const prevTo = mauritiusDayRange(prev.to);
    const [{ tables, sales }, bookingRes, collectRes, menuRes, previous] = await Promise.all([
      loadSales(admin, restaurantId, start, end, scope.tableNos),
      admin
        .from("restaurant_bookings")
        .select("status,party_size,source,payment_amount,cover_charge_amount")
        .eq("restaurant_id", restaurantId)
        .gte("booking_date", body.from)
        .lte("booking_date", body.to)
        .limit(5000),
      admin
        .from("restaurant_orders")
        .select("order_status,total_amount,accepted_at,ready_at,picked_up_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(5000),
      admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle(),
      prevFrom && prevTo ? loadSales(admin, restaurantId, prevFrom.start, prevTo.end, scope.tableNos).catch(() => null) : null,
    ]);
    if (bookingRes.error) return serverError(bookingRes.error);
    if (collectRes.error) return serverError(collectRes.error);

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
    };

    if (body.action === "print" || body.action === "preview") {
      const period = body.from === body.to ? body.from : `${body.from} to ${body.to}`;
      const report = statsReport(full, {
        period,
        area: scope.area?.name || null,
        withItems: body.detail === "items",
        sales: body.detail === "bills" ? sales : null,
      });
      if (body.action === "preview") {
        const { data: merchant } = await admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
        return reply({ ok: true, report: { ...report, merchant: merchant?.name || null } });
      }
      if (!mainPrinter(await activePrinters(admin, restaurantId))) {
        return reply({ ok: false, error: "No main printer is set up. On the partner dashboard, tick Customer receipts & bills on a printer." }, 409);
      }
      await queueReceiptJob(admin, restaurantId, { kind: "report", payload: report, source: "Statistics" });
      return reply({ ok: true });
    }

    return reply({
      ok: true,
      area_filter: { area: scope.area, locked: scope.locked, areas: scope.areas },
      stats: full,
    });
  } catch (error) {
    return serverError(error);
  }
}
