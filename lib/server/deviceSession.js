import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Signs a user in without a password: a one-time magic-link hash is created and verified on the
// server, and only the resulting session goes back to the device. Returns null on failure.
export async function issueSession(admin, email) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return null;

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  return error || !data?.session ? null : data.session;
}

export async function terminalEmail(admin, terminal) {
  if (terminal.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(terminal.auth_user_id);
    return error ? null : data?.user?.email || null;
  }
  const email = `pos-${randomUUID()}@terminals.passprive.com`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "pos_terminal", terminal_id: terminal.terminal_id },
  });
  if (createErr || !created?.user?.id) return null;
  const { error: attachErr } = await admin.rpc("pos_attach_auth_user", {
    p_terminal_id: terminal.terminal_id,
    p_user_id: created.user.id,
  });
  return attachErr ? null : email;
}
