import { readJson, reply, requireTerminal, serverError } from "../_terminal";
import { SPECIAL_ROLES, specialItem } from "@/lib/server/specials";

const ERRORS = { not_found: [404, "That special is no longer on the menu."], bad_action: [400, "Invalid request."] };

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, staffRole } = ctx;
    if (staffRole && !SPECIAL_ROLES.includes(staffRole)) {
      return reply({ ok: false, error: "Only the cashier can change today's specials." }, 403);
    }

    const body = await readJson(request);
    const action = String(body?.action || "");
    let args = { p_restaurant_id: restaurantId, p_action: action, p_kind: null, p_item: null, p_item_id: null };
    if (action === "add") {
      const made = specialItem(body);
      if (made.error) return reply({ ok: false, error: made.error }, 400);
      args = { ...args, p_kind: made.kind, p_item: made.item };
    } else if (["show", "hide", "delete"].includes(action)) {
      args.p_item_id = String(body?.item_id || "").slice(0, 64);
    } else {
      return reply({ ok: false, error: "Invalid request." }, 400);
    }

    const { data, error } = await admin.rpc("menu_special_edit", args);
    if (error) return serverError(error);
    if (!data?.ok) {
      const [status, message] = ERRORS[data?.error] || [400, "Could not update the specials."];
      return reply({ ok: false, error: message }, status);
    }
    return reply({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
