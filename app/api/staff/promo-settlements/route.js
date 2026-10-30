import { promoDue, promoHistory } from "@/lib/server/promoCode";
import { reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const [due, history] = await Promise.all([promoDue(ctx.admin, ctx.restaurantId), promoHistory(ctx.admin, ctx.restaurantId)]);
    return reply({ ok: true, ...due, history });
  } catch (error) {
    return serverError(error);
  }
}
