import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logoFromImage } from "@/lib/server/receiptLogo";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BYTES = 3 * 1024 * 1024;

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

async function current(db, restaurantId) {
  const [{ data: r }, { data: logo }] = await Promise.all([
    db.from("restaurants").select("vat_number, brn, registered_name").eq("id", restaurantId).maybeSingle(),
    db.from("restaurant_receipt_logos").select("png_b64, updated_at").eq("restaurant_id", restaurantId).maybeSingle(),
  ]);
  return {
    vat_number: r?.vat_number || "",
    brn: r?.brn || "",
    registered_name: r?.registered_name || "",
    logo: logo ? { png: `data:image/png;base64,${logo.png_b64}`, updated_at: logo.updated_at } : null,
  };
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
    const db = admin();

    if (body.action === "set_vat") {
      const vat = String(body.vat_number || "").replace(/\s+/g, "").slice(0, 20);
      if (vat && !/^[A-Za-z0-9-]{4,20}$/.test(vat)) return fail("Enter a valid VAT number.");
      const { error } = await db.from("restaurants").update({ vat_number: vat || null }).eq("id", restaurantId);
      if (error) return fail(error.message);
    } else if (body.action === "upload_logo") {
      const raw = String(body.image || "").replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      if (!buffer.length) return fail("Pick an image.");
      if (buffer.length > MAX_BYTES) return fail("The image is too large. Use one under 3 MB.");
      let logo;
      try {
        logo = await logoFromImage(buffer);
      } catch {
        return fail("That file is not an image we can read. Use a PNG or JPG.");
      }
      const { error } = await db.from("restaurant_receipt_logos").upsert({ restaurant_id: restaurantId, ...logo, updated_at: new Date().toISOString() });
      if (error) return fail(error.message);
    } else if (body.action === "remove_logo") {
      const { error } = await db.from("restaurant_receipt_logos").delete().eq("restaurant_id", restaurantId);
      if (error) return fail(error.message);
    } else if (body.action !== "get") {
      return fail("Invalid request.");
    }
    return NextResponse.json({ ok: true, settings: await current(db, restaurantId) });
  } catch (error) {
    return fail(error?.message || "Unknown error", 500);
  }
}
