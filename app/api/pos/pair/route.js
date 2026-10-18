import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NO_STORE = { "Cache-Control": "no-store" };

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return reply({ ok: false, error: "server_misconfigured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "bad_request" }, 400);
  }

  const code = String(body?.code || "").slice(0, 32);
  if (!code) return reply({ ok: false, error: "invalid_code" }, 400);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("pos_pair", {
    p_code: code,
    p_device_model: String(body?.device_model || "").slice(0, 80),
    p_app_version: String(body?.app_version || "").slice(0, 20),
  });

  if (error) return reply({ ok: false, error: "server_error" }, 500);
  if (!data?.ok) return reply({ ok: false, error: "invalid_code" }, 400);

  return reply({
    ok: true,
    device_token: data.device_token,
    terminal_id: data.terminal_id,
    label: data.label,
    merchant_name: data.merchant_name,
  });
}
