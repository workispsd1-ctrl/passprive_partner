import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const deviceId = request.nextUrl.searchParams.get("device_id");

    const supabase = serverClient();
    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = userRes.user.id;

    // 1. Get staff info
    const { data: staffRow, error: staffErr } = await admin
      .from("restaurant_staff")
      .select("restaurant_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (staffErr) {
      return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });
    }

    if (!staffRow?.restaurant_id) {
      return NextResponse.json({ ok: false, error: "No restaurant mapped to this staff member." }, { status: 404 });
    }

    const restaurantId = staffRow.restaurant_id;

    // 2. Check device if provided
    let isDeviceAuthorized = true;
    if (deviceId) {
      const { data: deviceRow, error: deviceErr } = await admin
        .from("restaurant_staff_devices")
        .select("is_active")
        .eq("device_id", deviceId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (deviceErr) {
        console.error("Device check error:", deviceErr);
      } else if (!deviceRow || !deviceRow.is_active) {
        isDeviceAuthorized = false;
      }
    }

    // 3. Get restaurant, layouts, and current stats
    const [
      { data: restaurantRow, error: restaurantErr }, 
      { data: userRow, error: profileErr },
      { data: layoutRows, error: layoutErr },
      { data: bookingRows, error: bookingErr }
    ] = await Promise.all([
      admin
        .from("restaurants")
        .select("id, name, cover_image, is_active, menu_json")
        .eq("id", restaurantId)
        .maybeSingle(),
      admin
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("restaurant_table_layouts")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("table_no", { ascending: true }),
      admin
        .from("restaurant_table_bookings")
        .select("booking_status")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString()) // Only today's bookings for stats
    ]);

    if (restaurantErr) return NextResponse.json({ ok: false, error: restaurantErr.message }, { status: 400 });
    if (profileErr) return NextResponse.json({ ok: false, error: profileErr.message }, { status: 400 });
    if (layoutErr) return NextResponse.json({ ok: false, error: layoutErr.message }, { status: 400 });
    if (bookingErr) return NextResponse.json({ ok: false, error: bookingErr.message }, { status: 400 });

    if (!restaurantRow) {
      return NextResponse.json({ ok: false, error: "Restaurant not found." }, { status: 404 });
    }

    // Calculate Stats
    const stats = {
      activeOrders: 0,
      pendingKitchen: 0,
      preparing: 0,
      cancelled: 0
    };

    if (bookingRows) {
      bookingRows.forEach(b => {
        const status = String(b.booking_status || "").toUpperCase();
        if (!["COMPLETED", "PAID", "CANCELLED"].includes(status)) {
          stats.activeOrders++;
        }
        if (status === "PLACED" || status === "CONFIRMED") {
          stats.pendingKitchen++;
        }
        if (status === "PREPARING") {
          stats.preparing++;
        }
        if (status === "CANCELLED") {
          stats.cancelled++;
        }
      });
    }

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: restaurantRow.id,
        name: restaurantRow.name || "Restaurant",
        cover_image: restaurantRow.cover_image || "",
        is_active: restaurantRow.is_active,
        menu: restaurantRow.menu_json // Map menu_json to menu for frontend consistency
      },
      operator_name: userRow?.full_name || "Staff",
      staff_role: staffRow.role,
      is_device_authorized: isDeviceAuthorized,
      table_layouts: layoutRows || [],
      stats: stats
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
