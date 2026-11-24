import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { allowedPhoto, readMenu, searchPhotos } from "@/lib/server/menuImport";

export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_PHOTO = 6 * 1024 * 1024;
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

async function ownStorageFile(url) {
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const u = new URL(String(url));
  if (u.protocol !== "https:" || u.hostname !== base.hostname || !u.pathname.startsWith("/storage/v1/object/public/")) return null;
  const res = await fetch(u);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length && buf.length <= MAX_FILE ? { name: "menu", type: res.headers.get("content-type") || "", data: buf.toString("base64") } : null;
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

    if (body.action === "read") {
      let file = body.file && typeof body.file === "object" ? body.file : null;
      if (!file && body.url) file = await ownStorageFile(body.url).catch(() => null);
      if (!file?.data) return fail("Pick a photo or PDF of your menu.");
      if (Buffer.byteLength(String(file.data), "base64") > MAX_FILE) return fail("That file is too large. Use one under 15 MB.");
      const key = process.env.OPENAI_API_KEY || (await db.rpc("receipt_ai_openai_key")).data;
      if (!key) return fail("Menu import is not available right now.", 503);
      let menu;
      try {
        menu = await readMenu(key, [file]);
      } catch (e) {
        console.error("menu import failed", e?.message);
        return fail("We couldn't read that file. Try a clearer photo or the PDF of the menu.", 502);
      }
      if (!menu.is_menu) return fail("This doesn't look like a menu.", 422);
      return NextResponse.json({ ok: true, sections: menu.sections });
    }

    if (body.action === "photos") {
      const key = process.env.PEXELS_API_KEY;
      if (!key) return NextResponse.json({ ok: true, available: false, photos: {} });
      const queries = Array.isArray(body.queries) ? body.queries.map(String) : [];
      return NextResponse.json({ ok: true, available: true, photos: await searchPhotos(key, queries) });
    }

    if (body.action === "save_photo") {
      const itemId = String(body.item_id || "");
      if (!SAFE_ID.test(itemId) || !allowedPhoto(body.url)) return fail("Invalid photo.");
      const res = await fetch(String(body.url));
      if (!res.ok) return fail("Couldn't download that photo.", 502);
      const raw = Buffer.from(await res.arrayBuffer());
      if (!raw.length || raw.length > MAX_PHOTO) return fail("Couldn't download that photo.", 502);
      const jpeg = await sharp(raw).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const path = `menu/${restaurantId}/${itemId}/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from("restaurants").upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (error) return fail(error.message, 500);
      const { data } = db.storage.from("restaurants").getPublicUrl(path);
      return NextResponse.json({ ok: true, url: data?.publicUrl || null });
    }

    return fail("Invalid request.");
  } catch (error) {
    return fail(error?.message || "Unknown error", 500);
  }
}
