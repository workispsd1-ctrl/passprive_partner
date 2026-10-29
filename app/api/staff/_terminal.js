import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/deviceSession";

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

  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  const userId = auth?.user?.id;
  if (authErr || !userId) return { error: reply({ ok: false, error: "unauthorized" }, 401) };

  const deviceToken = String(request.headers.get("x-device-token") || "").trim();
  const viaDevice = DEVICE_TOKEN_RE.test(deviceToken);
  let query = admin
    .from("pos_terminals")
    .select("id, restaurant_id, restaurants:restaurant_id(service_level)")
    .eq("status", "active");
  query = viaDevice
    ? query.eq("token_hash", createHash("sha256").update(deviceToken).digest("hex"))
    : query.eq("auth_user_id", userId);

  const { data: terminal, error: termErr } = await query.maybeSingle();
  if (termErr) return { error: serverError(termErr) };
  if (!terminal?.restaurant_id) return { error: reply({ ok: false, error: "device_not_paired" }, 401) };

  let staffRole = null;
  if (viaDevice) {
    const { data: staff, error: staffErr } = await admin
      .from("restaurant_staff")
      .select("role")
      .eq("restaurant_id", terminal.restaurant_id)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (staffErr) return { error: serverError(staffErr) };
    if (!staff) return { error: reply({ ok: false, error: "unauthorized" }, 401) };
    staffRole = String(staff.role || "").toLowerCase();
  }

  const restaurant = Array.isArray(terminal.restaurants) ? terminal.restaurants[0] : terminal.restaurants;
  if (!plans.includes(String(restaurant?.service_level || "").toLowerCase())) {
    return { error: reply({ ok: false, error: "not_in_plan" }, 403) };
  }

  return { admin, restaurantId: terminal.restaurant_id, terminalId: terminal.id, userId, staffRole };
}
