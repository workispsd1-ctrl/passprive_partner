import { createHash } from "node:crypto";
import { serviceClient } from "@/lib/server/deviceSession";
import { readJson, reply, serverError } from "../../staff/_terminal";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const deviceToken = String(body.device_token || "");
    if (!/^[a-f0-9]{64}$/.test(deviceToken)) return reply({ ok: false, error: "device_not_paired" }, 401);

    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    const { data, error } = await admin
      .from("pos_terminals")
      .select("status")
      .eq("token_hash", createHash("sha256").update(deviceToken).digest("hex"))
      .maybeSingle();
    if (error) return serverError(error);
    return reply({ ok: true, status: data?.status || "revoked" });
  } catch (error) {
    return serverError(error);
  }
}
