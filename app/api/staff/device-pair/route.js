import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

function clean(value) {
  return String(value || "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = clean(body?.action).toLowerCase() || "pair";
    const deviceId = clean(body?.device_id);

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "device_id is required" }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    if (action === "resolve") {
      const { data: row, error } = await admin
        .from("restaurant_staff_devices")
        .select("restaurant_id")
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, restaurant_id: row?.restaurant_id || null });
    }

    if (action === "unpair") {
      const { error } = await admin
        .from("restaurant_staff_devices")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("device_id", deviceId);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const restaurantId = clean(body?.restaurant_id);
    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurant_id is required to pair device" }, { status: 400 });
    }

    const { data: rest, error: restErr } = await admin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (restErr) return NextResponse.json({ ok: false, error: restErr.message }, { status: 400 });
    if (!rest?.id) return NextResponse.json({ ok: false, error: "Invalid restaurant_id" }, { status: 404 });

    const now = new Date().toISOString();
    const { error: upsertErr } = await admin.from("restaurant_staff_devices").upsert(
      {
        device_id: deviceId,
        restaurant_id: restaurantId,
        is_active: true,
        last_paired_at: now,
        updated_at: now,
      },
      { onConflict: "device_id" }
    );

    if (upsertErr) return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, restaurant_id: restaurantId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
