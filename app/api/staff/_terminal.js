import { readRetry } from "@/lib/server/dbRetry";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/deviceSession";
import { userIdFromToken } from "@/lib/server/verifyToken";

const NO_STORE = { "Cache-Control": "no-store" };
const DEVICE_TOKEN_RE = /^[a-f0-9]{64}$/;

export function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function serverError(error) {
  console.error("[staff-api]", error);
  return reply({ ok: false, error: "server_error" }, 500);
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export async function requireTerminal(request, plans = ["booking", "payments"]) {
  const admin = serviceClient();
  if (!admin) return { error: serverError("SUPABASE_SERVICE_ROLE_KEY is missing") };

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: reply({ ok: false, error: "unauthorized" }, 401) };

  const verified = await userIdFromToken(token).catch((error) => ({ error: { status: 500, message: error?.message } }));
  if (verified.error && !(verified.error.status >= 400 && verified.error.status < 500)) return { error: serverError(verified.error) };
  if (verified.error || !verified.userId) return { error: reply({ ok: false, error: "unauthorized" }, 401) };
  const userId = verified.userId;

  const deviceToken = String(request.headers.get("x-device-token") || "").trim();
  const viaDevice = DEVICE_TOKEN_RE.test(deviceToken);
  const termQuery = () => {
    const query = admin
      .from("pos_terminals")
      .select("id, restaurant_id, restaurants:restaurant_id(service_level)")
      .eq("status", "active");
    return (viaDevice
      ? query.eq("token_hash", createHash("sha256").update(deviceToken).digest("hex"))
      : query.eq("auth_user_id", userId)
    ).maybeSingle();
  };
  const [termRes, staffRes] = await Promise.all([
    readRetry(termQuery),
    viaDevice ? readRetry(() => admin.from("restaurant_staff").select("restaurant_id, role").eq("user_id", userId).limit(20)) : Promise.resolve({ data: [] }),
  ]);
  if (!termRes || !staffRes) return { error: reply({ ok: false, error: "server_busy" }, 503) };
  const terminal = termRes.data;
  if (!terminal?.restaurant_id) return { error: reply({ ok: false, error: "device_not_paired" }, 401) };

  let staffRole = null;
  if (viaDevice) {
    const staff = (staffRes.data || []).find((r) => r.restaurant_id === terminal.restaurant_id);
    if (!staff) return { error: reply({ ok: false, error: "staff_removed" }, 403) };
    staffRole = String(staff.role || "").toLowerCase();
  }

  const restaurant = Array.isArray(terminal.restaurants) ? terminal.restaurants[0] : terminal.restaurants;
  if (!plans.includes(String(restaurant?.service_level || "").toLowerCase())) {
    return { error: reply({ ok: false, error: "not_in_plan" }, 403) };
  }

  return { admin, restaurantId: terminal.restaurant_id, terminalId: terminal.id, userId, staffRole };
}
