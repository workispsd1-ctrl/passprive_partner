import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { acknowledge, assignTable, movesFor, serveHere } from "@/lib/server/guestMoves";
import { tillArea } from "@/lib/server/tillArea";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const body = await readJson(request);
    const action = String(body.action || "list");
    const { admin, restaurantId, userId } = ctx;
    if (action === "assign") {
      const { status, body: out } = await assignTable(admin, restaurantId, userId, body);
      return reply(out, status);
    }
    if (action === "serve_here") {
      const { status, body: out } = await serveHere(admin, restaurantId, userId, body);
      return reply(out, status);
    }
    if (action === "ack") {
      const { status, body: out } = await acknowledge(admin, restaurantId, userId, body);
      return reply(out, status);
    }
    const area = await tillArea(admin, ctx);
    return reply({ ok: true, ...(await movesFor(admin, restaurantId, area?.id || null, userId)) });
  } catch (error) {
    return serverError(error);
  }
}
