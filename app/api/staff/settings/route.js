import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function verifyDevice(admin, deviceId, restaurantId) {
  const { data, error } = await admin
    .from("restaurant_staff_devices")
    .select("device_id")
    .eq("device_id", deviceId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.device_id) throw new Error("Device not authorized.");
}

// POST — read settings
export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json({ ok: false, error: "restaurant_id and device_id are required" }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    await verifyDevice(admin, deviceId, restaurantId);

    const [restaurantRes, tagsRes, mediaRes, paymentRes] = await Promise.all([
      admin
        .from("restaurants")
        .select("id,name,phone,area,city,full_address,cost_for_two,slug,cover_image,latitude,longitude,booking_enabled,avg_duration_minutes,max_bookings_per_slot,advance_booking_days,is_active")
        .eq("id", restaurantId)
        .single(),
      admin
        .from("restaurant_tags")
        .select("tag_value,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("tag_type", "cuisine")
        .order("sort_order", { ascending: true }),
      admin
        .from("restaurant_media_assets")
        .select("asset_type,file_url,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .in("asset_type", ["food", "ambience", "cover"])
        .order("sort_order", { ascending: true }),
      admin
        .from("restaurant_payment_details")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
    ]);

    if (restaurantRes.error) throw new Error(restaurantRes.error.message);

    const cuisines = (tagsRes.data || []).map((r) => r.tag_value).filter(Boolean);
    const mediaRows = mediaRes.data || [];
    const food_images = mediaRows.filter((r) => r.asset_type === "food").map((r) => r.file_url);
    const ambience_images = mediaRows.filter((r) => r.asset_type === "ambience").map((r) => r.file_url);

    return NextResponse.json({
      ok: true,
      restaurant: { ...restaurantRes.data, cuisines, food_images, ambience_images },
      payment_details: paymentRes.data || null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

// PUT — update settings
export async function PUT(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json({ ok: false, error: "restaurant_id and device_id are required" }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    await verifyDevice(admin, deviceId, restaurantId);

    const {
      restaurant_id: _rid,
      device_id: _did,
      cuisines,
      ...restaurantUpdates
    } = body;

    // Filter to only known safe columns
    const allowed = [
      "name","phone","area","city","full_address","cost_for_two","slug",
      "latitude","longitude","booking_enabled","avg_duration_minutes",
      "max_bookings_per_slot","advance_booking_days","is_active",
    ];
    const safeUpdates = Object.fromEntries(
      Object.entries(restaurantUpdates).filter(([k]) => allowed.includes(k))
    );

    const { data, error } = await admin
      .from("restaurants")
      .update(safeUpdates)
      .eq("id", restaurantId)
      .select("id,name,phone,area,city,full_address,cost_for_two,slug,cover_image,latitude,longitude,booking_enabled,avg_duration_minutes,max_bookings_per_slot,advance_booking_days,is_active")
      .single();

    if (error) throw new Error(error.message);

    // Update cuisines if provided
    if (Array.isArray(cuisines)) {
      const cleanCuisines = cuisines.map((c) => String(c || "").trim()).filter(Boolean);

      await admin.from("restaurant_tags").delete().eq("restaurant_id", restaurantId).eq("tag_type", "cuisine");

      if (cleanCuisines.length) {
        const { error: tagErr } = await admin.from("restaurant_tags").insert(
          cleanCuisines.map((tag, idx) => ({
            restaurant_id: restaurantId,
            tag_type: "cuisine",
            tag_value: tag,
            sort_order: idx,
          }))
        );
        if (tagErr) throw new Error(tagErr.message);
      }
    }

    return NextResponse.json({ ok: true, restaurant: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
