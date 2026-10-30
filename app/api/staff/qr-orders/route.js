import { ackQrOrder, heldQrOrders } from "@/lib/server/printJobs";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const body = await readJson(request);

    if (body.action === "ack") {
      const jobId = String(body.job_id || "");
      if (!UUID_RE.test(jobId)) return reply({ ok: false, error: "invalid_job" }, 400);
      await ackQrOrder(ctx.admin, ctx.restaurantId, jobId, ctx.userId);
    }

    return reply({ ok: true, orders: await heldQrOrders(ctx.admin, ctx.restaurantId) });
  } catch (error) {
    return serverError(error);
  }
}
