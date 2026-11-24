import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { confirmPrintJob, failPrintJob, leasePrintJob, printHistory, reprintJob, unleasePrintJob } from "@/lib/server/printJobs";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId } = ctx;
    const body = await readJson(request);
    if (body?.action === "history") {
      const orderId = String(body?.order_id || "");
      if (!UUID.test(orderId)) return reply({ ok: false, error: "invalid_order" }, 400);
      return reply({ ok: true, jobs: await printHistory(admin, restaurantId, orderId) });
    }
    const jobId = String(body?.job_id || "");
    if (!UUID.test(jobId)) return reply({ ok: false, error: "invalid_job" }, 400);
    if (body?.action === "reprint") {
      const out = await reprintJob(admin, restaurantId, jobId, terminalId);
      return reply(out, out.ok ? 200 : out.error === "not_found" ? 404 : 409);
    }
    if (body?.action === "lease") return reply({ ok: true, leased: await leasePrintJob(admin, restaurantId, terminalId, jobId) });
    if (body?.action === "confirm") {
      await confirmPrintJob(admin, restaurantId, terminalId, jobId, body?.printer_id || null);
      return reply({ ok: true });
    }
    if (body?.action === "fail") {
      await failPrintJob(admin, restaurantId, terminalId, jobId, body?.reason);
      return reply({ ok: true });
    }
    if (body?.action === "unlease") {
      await unleasePrintJob(admin, restaurantId, terminalId, jobId);
      return reply({ ok: true });
    }
    return reply({ ok: false, error: "bad_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
