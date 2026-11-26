import { buildTillStats, buildReport } from "@/lib/server/tillReport";
import { mauritiusDayRange } from "@/lib/server/billHistory";
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

    const built = await buildTillStats(admin, restaurantId, { start, end, from: body.from, to: body.to, scope });
    const { full } = built;

    if (body.action === "print" || body.action === "preview") {
      const lang = body.lang === "fr" ? "fr" : "en";
      const { report, merchant } = await buildReport(admin, restaurantId, built, { start, end, from: body.from, to: body.to, lang, userId: ctx.userId, area: scope.area?.name || null });
      if (body.action === "preview") return reply({ ok: true, report: { ...report, merchant: merchant?.name || null } });
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
