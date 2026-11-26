import { createClient } from "@supabase/supabase-js";

let verifier = null;

function client() {
  if (verifier) return verifier;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return verifier;
}

export async function userIdFromToken(token) {
  const c = client();
  if (!c) return { error: { status: 500, message: "Supabase is not configured" } };
  const { data, error } = await c.auth.getClaims(token);
  if (error) return { error };
  const sub = data?.claims?.sub;
  if (!sub || data?.claims?.role === "anon") return { error: { status: 401, message: "unauthorized" } };
  return { userId: sub };
}
