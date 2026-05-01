import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function getOwnerRestaurant(token) {
  const supabase = serverClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", userRes.user.id)
    .single();

  if (restErr || !restaurant?.id) return { error: "No owned restaurant found.", status: 403 };
  return { restaurantId: restaurant.id };
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data, error } = await admin
      .from("restaurant_staff_devices")
      .select("id, device_id, is_active, last_paired_at, created_at, updated_at")
      .eq("restaurant_id", owner.restaurantId)
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, devices: data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const body = await request.json();
    const deviceId = String(body?.device_id || "").trim();
    if (!deviceId) return NextResponse.json({ ok: false, error: "device_id is required" }, { status: 400 });

    const { error } = await admin
      .from("restaurant_staff_devices")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("restaurant_id", owner.restaurantId)
      .eq("device_id", deviceId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
