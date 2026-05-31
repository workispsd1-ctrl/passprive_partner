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

function parseMenu(menu) {
  if (!menu) return {};
  if (typeof menu === "string") {
    try {
      return JSON.parse(menu);
    } catch {
      return {};
    }
  }
  return menu;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = clean(body?.restaurant_id);
    const deviceId = clean(body?.device_id);

    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurant_id is required" }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "device_id is required" }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: deviceRow, error: deviceErr } = await admin
      .from("restaurant_staff_devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (deviceErr) return NextResponse.json({ ok: false, error: deviceErr.message }, { status: 400 });
    if (!deviceRow?.device_id) {
      return NextResponse.json({ ok: false, error: "This device is not paired for this restaurant." }, { status: 403 });
    }

    const [
      { data: restaurantRow, error: restaurantErr },
      { data: tableRows, error: tableErr },
      { data: orderRows, error: orderErr },
    ] = await Promise.all([
      admin
        .from("restaurants")
        .select("id, name, cover_image, is_active, menu_json")
        .eq("id", restaurantId)
        .eq("is_active", true)
        .maybeSingle(),
      admin
        .from("restaurant_table_layouts")
        .select("id, table_no, label, capacity")
        .eq("restaurant_id", restaurantId)
        .order("table_no", { ascending: true }),
      admin
        .from("restaurant_table_bookings")
        .select("id, table_no, booking_status, payment_status, total_amount, order_items, notes, updated_at, source, order_details")
        .eq("restaurant_id", restaurantId)
        .not("booking_status", "in", "(CANCELLED,COMPLETED,PAID)")
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

    if (restaurantErr) return NextResponse.json({ ok: false, error: restaurantErr.message }, { status: 400 });
    if (tableErr) return NextResponse.json({ ok: false, error: tableErr.message }, { status: 400 });
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 400 });
    if (!restaurantRow?.id) {
      return NextResponse.json({ ok: false, error: "Restaurant not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: restaurantRow.id,
        name: restaurantRow.name || "Restaurant",
        cover_image: restaurantRow.cover_image || "",
      },
      menu: parseMenu(restaurantRow.menu_json),
      tables: tableRows || [],
      open_orders: orderRows || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
