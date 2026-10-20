import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { issueSession, serviceClient } from "@/lib/server/deviceSession";

const NO_STORE = { "Cache-Control": "no-store" };
const ERROR_STATUS = { device_not_paired: 401, wrong_pin: 401, locked: 423, pin_not_set: 409 };

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request) {
  const admin = serviceClient();
  if (!admin) return reply({ ok: false, error: "server_misconfigured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "bad_request" }, 400);
  }

  const deviceToken = String(body?.device_token || "");
  const pin = String(body?.pin || "");
  if (!/^[a-f0-9]{64}$/.test(deviceToken)) return reply({ ok: false, error: "device_not_paired" }, 401);
  if (!/^\d{4,6}$/.test(pin)) return reply({ ok: false, error: "wrong_pin" }, 401);

  const { data, error } = await admin.rpc("pos_pin_login", { p_device_token: deviceToken, p_pin: pin });
  if (error) return reply({ ok: false, error: "server_error" }, 500);
  if (!data?.ok) {
    return reply({ ok: false, error: data?.error || "wrong_pin", locked_until: data?.locked_until || null }, ERROR_STATUS[data?.error] || 401);
  }

  let email;
  if (data.auth_user_id) {
    const { data: found, error: findErr } = await admin.auth.admin.getUserById(data.auth_user_id);
    if (findErr || !found?.user?.email) return reply({ ok: false, error: "server_error" }, 500);
    email = found.user.email;
  } else {
    email = `pos-${randomUUID()}@terminals.passprive.com`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "pos_terminal", terminal_id: data.terminal_id },
    });
    if (createErr || !created?.user?.id) return reply({ ok: false, error: "server_error" }, 500);
    const { error: attachErr } = await admin.rpc("pos_attach_auth_user", {
      p_terminal_id: data.terminal_id,
      p_user_id: created.user.id,
    });
    if (attachErr) return reply({ ok: false, error: "server_error" }, 500);
  }

  const session = await issueSession(admin, email);
  if (!session) return reply({ ok: false, error: "server_error" }, 500);

  return reply({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    terminal_id: data.terminal_id,
    label: data.label,
    merchant_name: data.merchant_name,
  });
}
