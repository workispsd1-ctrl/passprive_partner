import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { confirmPrintJob, leasePrintJob, unleasePrintJob } from "@/lib/server/printJobs";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId } = ctx;
    const body = await readJson(request);
    const jobId = String(body?.job_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return reply({ ok: false, error: "invalid_job" }, 400);
    if (body?.action === "lease") return reply({ ok: true, leased: await leasePrintJob(admin, restaurantId, terminalId, jobId) });
    if (body?.action === "confirm") {
      await confirmPrintJob(admin, restaurantId, terminalId, jobId, body?.printer_id || null);
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
