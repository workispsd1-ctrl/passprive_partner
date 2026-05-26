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

function normalizeUuid(value) {
  const v = String(value || "").trim();
  return /^[0-9a-fA-F-]{36}$/.test(v) ? v : "";
}

async function getOwnerRestaurant(token, requestedRestaurantId = "") {
  const supabase = serverClient();
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };
  const userId = userRes.user.id;

  const reqId = normalizeUuid(requestedRestaurantId);
  const { data: ownerRestaurants, error: restErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", userId);

  if (restErr) return { error: restErr.message || "Failed to resolve restaurant", status: 400 };
  const ownedIds = new Set((ownerRestaurants || []).map((r) => String(r.id || "")).filter(Boolean));
  if (reqId && ownedIds.has(reqId)) return { restaurantId: reqId };
  if (!reqId && ownedIds.size > 0) {
    const firstOwned = ownerRestaurants[0];
    if (firstOwned?.id) return { restaurantId: firstOwned.id };
  }

  const { data: staffRows, error: staffErr } = await admin
    .from("restaurant_staff")
    .select("restaurant_id, role")
    .eq("user_id", userId)
    .eq("role", "restaurant_admin");

  if (staffErr) return { error: staffErr.message || "Failed to resolve restaurant staff", status: 400 };
  const managedIds = new Set((staffRows || []).map((r) => String(r.restaurant_id || "")).filter(Boolean));
  if (reqId && managedIds.has(reqId)) return { restaurantId: reqId };
  if (!reqId && managedIds.size > 0) {
    const firstManaged = staffRows[0];
    if (firstManaged?.restaurant_id) return { restaurantId: firstManaged.restaurant_id };
  }

  return { error: "No owned restaurant found.", status: 403 };
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const requestedRestaurantId = request.nextUrl?.searchParams?.get("restaurant_id") || "";
    const owner = await getOwnerRestaurant(token, requestedRestaurantId);
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

    const body = await request.json();
    const requestedRestaurantId = String(body?.restaurant_id || "").trim();
    const owner = await getOwnerRestaurant(token, requestedRestaurantId);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

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
