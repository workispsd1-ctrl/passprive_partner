import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const STOCK_ROLES = ["cashier", "restaurant_cashier", "restaurant_admin", "admin", "kitchen", "restaurant_kitchen"];

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, staffRole } = ctx;
    if (staffRole && !STOCK_ROLES.includes(staffRole)) {
      return reply({ ok: false, error: "Only the cashier or kitchen can mark dishes sold out." }, 403);
    }
    const body = await readJson(request);
    const itemId = String(body?.item_id || "").slice(0, 64);
    if (!itemId || typeof body?.sold_out !== "boolean") return reply({ ok: false, error: "Invalid request." }, 400);

    const { data, error } = await admin.rpc("menu_item_sold_out", {
      p_restaurant_id: restaurantId,
      p_item_id: itemId,
      p_sold_out: body.sold_out,
    });
    if (error) return serverError(error);
    if (!data?.ok) return reply({ ok: false, error: "That dish is no longer on the menu." }, 404);
    return reply({ ok: true, sold_out_on: data.sold_out_on || null });
  } catch (error) {
    return serverError(error);
  }
}
