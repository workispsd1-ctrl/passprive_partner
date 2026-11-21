import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { finishDiscovery } from "@/lib/server/printerDiscovery";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    await finishDiscovery(ctx.admin, ctx.restaurantId, ctx.terminalId, await readJson(request));
    return reply({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
