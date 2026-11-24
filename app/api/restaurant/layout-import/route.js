import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readLayout } from "@/lib/server/layoutImport";

export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const fail = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function asUser(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return fail("Please sign in again.", 401);
    const body = await request.json().catch(() => ({}));
    const restaurantId = String(body?.restaurant_id || "");
    if (!UUID.test(restaurantId)) return fail("Invalid request.");
    const { data: allowed, error: authErr } = await asUser(token).rpc("can_manage_restaurant", { in_restaurant_id: restaurantId });
    if (authErr || !allowed) return fail("You can't manage this restaurant.", 403);

    const buffer = Buffer.from(String(body?.image || "").replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buffer.length) return fail("Pick a photo of your floor plan.");
    if (buffer.length > MAX_BYTES) return fail("The photo is too large. Use one under 8 MB.");

    const key = process.env.OPENAI_API_KEY || (await admin().rpc("receipt_ai_openai_key")).data;
    if (!key) return fail("Photo import is not available right now.", 503);

    let layout;
    try {
      layout = await readLayout(key, buffer);
    } catch (e) {
      console.error("layout import failed", e?.message);
      return fail("We couldn't read that photo. Try a clearer, top-down photo of the plan.", 502);
    }
    if (!layout.is_floor_plan) return fail("This doesn't look like a floor plan. Take a photo of the plan or sketch from above.", 422);
    return NextResponse.json({ ok: true, tables: layout.tables, items: layout.items });
  } catch (error) {
    return fail(error?.message || "Unknown error", 500);
  }
}
