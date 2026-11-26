import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { closeBlockers, currentDay, lastClosedDay, markClosed, openDay } from "@/lib/server/businessDay";
import { buildReport, buildTillStats, mauritiusDate } from "@/lib/server/tillReport";
import { activePrinters, mainPrinter, queueReceiptJob } from "@/lib/server/printJobs";
import { tillArea } from "@/lib/server/tillArea";

const NO_ACCESS = /waiter|bearer|kitchen/;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, userId } = ctx;
    const body = await readJson(request);
    const action = String(body?.action || "status");

    if (action === "status") {
      const [day, last] = await Promise.all([currentDay(admin, restaurantId), lastClosedDay(admin, restaurantId)]);
      return reply({ ok: true, day, last_closed: last });
    }

    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "Only the cashier can open or close the day." }, 403);
    if (await tillArea(admin, ctx)) return reply({ ok: false, error: "Only the main cashier can open or close the day." }, 403);

    if (action === "open") {
      const { status, body: out } = await openDay(admin, restaurantId, userId);
      return reply(out, status);
    }

    if (action === "check") {
      return reply({ ok: true, day: await currentDay(admin, restaurantId), blockers: await closeBlockers(admin, restaurantId) });
    }

    if (action === "close") {
      const day = await currentDay(admin, restaurantId);
      if (!day) return reply({ ok: false, error: "The day is not open." }, 409);
      const blockers = await closeBlockers(admin, restaurantId);
      if (!blockers.ready) return reply({ ok: false, error: "not_ready", blockers }, 409);
      const printer = mainPrinter(await activePrinters(admin, restaurantId));
      const end = new Date().toISOString();
      const range = { start: day.opened_at, end, from: mauritiusDate(day.opened_at), to: mauritiusDate(end) };
      const built = await buildTillStats(admin, restaurantId, { ...range, scope: null });
      const { report } = await buildReport(admin, restaurantId, built, { ...range, lang: "fr", userId });
      const closed = await markClosed(admin, restaurantId, day, userId, { ...report, journal: built.full.journal });
      if (!closed) return reply({ ok: false, error: "The day was already closed." }, 409);
      if (printer) await queueReceiptJob(admin, restaurantId, { kind: "report", payload: report, source: "Day closing" });
      return reply({ ok: true, day: closed, printed: Boolean(printer) });
    }

    return reply({ ok: false, error: "bad_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
