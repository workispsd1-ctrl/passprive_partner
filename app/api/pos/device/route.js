import { serviceClient } from "@/lib/server/deviceSession";
import { readJson, reply, serverError } from "../../staff/_terminal";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const deviceToken = String(body.device_token || "");
    if (!/^[a-f0-9]{64}$/.test(deviceToken)) return reply({ ok: false, error: "device_not_paired" }, 401);

    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    if (body.action === "name") {
      const name = String(body.name || "").trim();
      if (!name) return reply({ ok: false, error: "invalid_name" }, 400);
      const { data, error } = await admin.rpc("pos_set_device_name", { p_device_token: deviceToken, p_name: name });
      if (error) return serverError(error);
      return data ? reply({ ok: true }) : reply({ ok: false, error: "device_not_paired" }, 401);
    }

    if (body.action === "logout") {
      const { error } = await admin.rpc("pos_device_logout", { p_device_token: deviceToken });
      if (error) return serverError(error);
      return reply({ ok: true });
    }

    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
