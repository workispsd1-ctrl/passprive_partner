import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "restaurant_id and device_id are required" },
        { status: 400 }
      );
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." },
        { status: 500 }
      );
    }

    const { data: deviceRow, error: deviceErr } = await admin
      .from("restaurant_staff_devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (deviceErr) return NextResponse.json({ ok: false, error: deviceErr.message }, { status: 400 });
    if (!deviceRow?.device_id) {
      return NextResponse.json({ ok: false, error: "Device not authorized." }, { status: 403 });
    }

    const { data: reviews, error: reviewsErr } = await admin
      .from("restaurant_reviews")
      .select("id,rating,review_text,username_snapshot,created_at,owner_reply_text,owner_reply_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (reviewsErr) return NextResponse.json({ ok: false, error: reviewsErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, reviews: reviews || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
