import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/deviceSession";

const NO_STORE = { "Cache-Control": "no-store" };

export function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

// The real error stays in the server log; the device only sees a generic code.
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

// Every /api/staff/* call must come from a POS terminal that the owner paired from the dashboard
// and unlocked with the POS PIN (/api/pos/pair, /api/pos/login). The restaurant is read from the
// terminal row, never from the request, and a revoked terminal is refused straight away.
// `plans` lists the service levels allowed to use the route.
export async function requireTerminal(request, plans = ["booking", "payments"]) {
  const admin = serviceClient();
  if (!admin) return { error: serverError("SUPABASE_SERVICE_ROLE_KEY is missing") };

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: reply({ ok: false, error: "unauthorized" }, 401) };

  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user?.id) return { error: reply({ ok: false, error: "unauthorized" }, 401) };

  const { data: terminal, error: termErr } = await admin
    .from("pos_terminals")
    .select("id, restaurant_id, restaurants:restaurant_id(service_level)")
    .eq("auth_user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (termErr) return { error: serverError(termErr) };
  if (!terminal?.restaurant_id) return { error: reply({ ok: false, error: "device_not_paired" }, 401) };

  const restaurant = Array.isArray(terminal.restaurants) ? terminal.restaurants[0] : terminal.restaurants;
  if (!plans.includes(String(restaurant?.service_level || "").toLowerCase())) {
    return { error: reply({ ok: false, error: "not_in_plan" }, 403) };
  }

  return { admin, restaurantId: terminal.restaurant_id, terminalId: terminal.id };
}
