import { createHash, randomInt } from "node:crypto";
import QRCode from "qrcode";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_SECONDS = 60;
const INVITE_LABEL = "MultiPOS invite";
const DEVICE_COLUMNS = "id,label,status,device_model,paired_at,last_login_at";

function newCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

async function rotateCode({ admin, restaurantId, userId }) {
  const code = newCode();
  const pairing = {
    pairing_code_hash: createHash("sha256").update(code).digest("hex"),
    pairing_expires_at: new Date(Date.now() + CODE_SECONDS * 1000).toISOString(),
  };
  const { data: invite, error: findErr } = await admin
    .from("pos_terminals")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .eq("needs_approval", true)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  const { error } = invite
    ? await admin.from("pos_terminals").update(pairing).eq("id", invite.id)
    : await admin.from("pos_terminals").insert({
        ...pairing,
        restaurant_id: restaurantId,
        label: INVITE_LABEL,
        status: "pending",
        needs_approval: true,
        created_by: userId,
      });
  if (error) throw error;

  const qr_svg = await QRCode.toString(code, { type: "svg", margin: 1 });
  return { code, qr_svg, expires_in: CODE_SECONDS };
}

async function deviceList({ admin, restaurantId, terminalId }) {
  const { data, error } = await admin
    .from("pos_terminals")
    .select(DEVICE_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .in("status", ["awaiting", "active"])
    .order("paired_at", { ascending: true });
  if (error) throw error;
  const rows = (data || []).map((d) => ({ ...d, is_this_device: d.id === terminalId }));
  return {
    incoming: rows.filter((d) => d.status === "awaiting"),
    devices: rows.filter((d) => d.status === "active"),
  };
}

async function approve({ admin, restaurantId }, id) {
  const { count, error: countErr } = await admin
    .from("pos_terminals")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("needs_approval", true)
    .in("status", ["active", "revoked"]);
  if (countErr) throw countErr;
  const { data, error } = await admin
    .from("pos_terminals")
    .update({ status: "active", label: `MultiPOS ${(count || 0) + 1}` })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "awaiting")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);

    const body = await readJson(request);
    const action = String(body.action || "list");
    const id = String(body.terminal_id || "");
    const validId = /^[0-9a-f-]{36}$/i.test(id);

    if (action === "code") return reply({ ok: true, ...(await rotateCode(ctx)) });

    if (action === "approve") {
      if (!validId) return reply({ ok: false, error: "invalid_device" }, 400);
      if (!(await approve(ctx, id))) return reply({ ok: false, error: "invalid_device" }, 404);
    } else if (action === "remove") {
      if (!validId || id === ctx.terminalId) return reply({ ok: false, error: "invalid_device" }, 400);
      const { data, error } = await ctx.admin.rpc("pos_multipos_remove", {
        p_terminal_id: id,
        p_restaurant_id: ctx.restaurantId,
      });
      if (error) throw error;
      if (!data) return reply({ ok: false, error: "invalid_device" }, 404);
    } else if (action !== "list") {
      return reply({ ok: false, error: "invalid_action" }, 400);
    }

    return reply({ ok: true, ...(await deviceList(ctx)) });
  } catch (error) {
    return serverError(error);
  }
}
