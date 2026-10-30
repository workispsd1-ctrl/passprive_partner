import { issueSession, serviceClient, terminalEmail } from "@/lib/server/deviceSession";
import { readJson, reply, serverError } from "../../staff/_terminal";

const PLANS = ["booking", "payments"];

async function staffLogin(admin, terminal) {
  if (!terminal.staff_user_id) return reply({ ok: false, error: "pin_required" }, 409);

  const { data: staff, error: staffErr } = await admin
    .from("restaurant_staff")
    .select("role")
    .eq("restaurant_id", terminal.restaurant_id)
    .eq("user_id", terminal.staff_user_id)
    .limit(1)
    .maybeSingle();
  if (staffErr) return serverError(staffErr);
  if (!staff) return reply({ ok: false, error: "staff_removed" }, 403);

  const { data: restaurant, error: restErr } = await admin
    .from("restaurants")
    .select("service_level")
    .eq("id", terminal.restaurant_id)
    .maybeSingle();
  if (restErr) return serverError(restErr);
  if (!PLANS.includes(String(restaurant?.service_level || "").toLowerCase())) {
    return reply({ ok: false, error: "not_in_plan" }, 403);
  }

  const { data: found, error: findErr } = await admin.auth.admin.getUserById(terminal.staff_user_id);
  if (findErr || !found?.user?.email) return serverError(findErr || "staff user has no email");

  const session = await issueSession(admin, found.user.email);
  if (!session) return serverError("could not issue staff session");

  return reply({
    ok: true,
    role: staff.role,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    terminal_id: terminal.terminal_id,
    label: terminal.label,
    merchant_name: terminal.merchant_name,
  });
}

async function terminalLogin(admin, terminal) {
  const email = await terminalEmail(admin, terminal);
  if (!email) return serverError("could not resolve terminal user");
  const session = await issueSession(admin, email);
  if (!session) return serverError("could not issue terminal session");
  return reply({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    terminal_id: terminal.terminal_id,
    label: terminal.label,
    merchant_name: terminal.merchant_name,
  });
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const deviceToken = String(body.device_token || "");
    if (!/^[a-f0-9]{64}$/.test(deviceToken)) return reply({ ok: false, error: "device_not_paired" }, 401);

    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    const { data, error } = await admin.rpc("pos_device_login", { p_device_token: deviceToken });
    if (error) return serverError(error);
    if (!data?.ok) return reply({ ok: false, error: "device_not_paired" }, 401);

    return body.app === "staff" ? staffLogin(admin, data) : terminalLogin(admin, data);
  } catch (error) {
    return serverError(error);
  }
}
