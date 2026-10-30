import { promoDue } from "@/lib/server/promoCode";
import { reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    return reply({ ok: true, ...(await promoDue(ctx.admin, ctx.restaurantId)) });
  } catch (error) {
    return serverError(error);
  }
}
