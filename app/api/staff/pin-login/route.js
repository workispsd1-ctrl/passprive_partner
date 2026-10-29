import { issueSession, serviceClient } from "@/lib/server/deviceSession";
import { readJson, reply, serverError } from "../_terminal";

const ERROR_STATUS = { device_not_paired: 401, wrong_pin: 401, locked: 423 };

// Staff sign in on a device the owner paired from the POS Terminals page. The device sends its
// pairing token and the staff member's own PIN; the PIN check and lockout run in the database.
export async function POST(request) {
  const body = await readJson(request);
  const deviceToken = String(body.device_token || "");
  const pin = String(body.pin || "");
  if (!/^[a-f0-9]{64}$/.test(deviceToken)) return reply({ ok: false, error: "device_not_paired" }, 401);
  if (!/^\d{4}$/.test(pin)) return reply({ ok: false, error: "wrong_pin" }, 401);

  try {
    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    const { data, error } = await admin.rpc("staff_pin_login", { p_device_token: deviceToken, p_pin: pin });
    if (error) return serverError(error);
    if (!data?.ok) {
      return reply(
        { ok: false, error: data?.error || "wrong_pin", locked_until: data?.locked_until || null },
        ERROR_STATUS[data?.error] || 401
      );
    }

    const { data: restaurant, error: restErr } = await admin
      .from("restaurants")
      .select("service_level")
      .eq("id", data.restaurant_id)
      .maybeSingle();
    if (restErr) return serverError(restErr);
    if (!["booking", "payments"].includes(String(restaurant?.service_level || "").toLowerCase())) {
      return reply({ ok: false, error: "not_in_plan" }, 403);
    }

    const { data: found, error: findErr } = await admin.auth.admin.getUserById(data.user_id);
    if (findErr || !found?.user?.email) return serverError(findErr || "staff user has no email");

    const session = await issueSession(admin, found.user.email);
    if (!session) return serverError("could not issue staff session");

    return reply({
      ok: true,
      role: data.role,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (error) {
    return serverError(error);
  }
}
