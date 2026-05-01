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

/** Resolves which restaurant belongs to this authenticated user. No role restriction. */
async function resolveRestaurant(token) {
  const supabase = serverClient();
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const userId = userRes.user.id;

  // 1. Try staff assignment
  const { data: staffRow } = await admin
    .from("restaurant_staff")
    .select("restaurant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  let restaurantId = staffRow?.restaurant_id || null;

  // 2. Fallback: restaurant owner
  if (!restaurantId) {
    const { data: ownerRow } = await admin
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle();
    restaurantId = ownerRow?.id || null;
  }

  if (!restaurantId) {
    return { error: "No restaurant found for this account.", status: 403 };
  }

  const { data: restaurant, error: restaurantErr } = await admin
    .from("restaurants")
    .select("id, name, cover_image")
    .eq("id", restaurantId)
    .maybeSingle();

  if (restaurantErr) return { error: restaurantErr.message, status: 400 };
  if (!restaurant?.id) return { error: "Restaurant not found", status: 404 };

  return {
    userId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "Restaurant",
    restaurantLogo: restaurant.cover_image || "",
    admin,
  };
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const ctx = await resolveRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const { data, error } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id,table_no,customer_name,customer_phone,order_items,order_details,total_amount,payment_status,booking_status,notes,created_at,updated_at,session_id")
      .eq("restaurant_id", ctx.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: ctx.restaurantId,
        name: ctx.restaurantName,
        logo: ctx.restaurantLogo,
      },
      orders: data || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

const VALID_BOOKING_STATUSES = ["PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "PAID", "CANCELLED"];

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const ctx = await resolveRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json().catch(() => ({}));
    const { booking_id, booking_status } = body;

    if (!booking_id) {
      return NextResponse.json({ ok: false, error: "booking_id is required" }, { status: 400 });
    }

    const nextStatus = String(booking_status || "").toUpperCase();
    if (!VALID_BOOKING_STATUSES.includes(nextStatus)) {
      return NextResponse.json(
        { ok: false, error: `Invalid booking_status. Must be one of: ${VALID_BOOKING_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify the booking belongs to this restaurant (security check)
    const { data: existing, error: existErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id, restaurant_id, booking_status")
      .eq("id", booking_id)
      .eq("restaurant_id", ctx.restaurantId)
      .maybeSingle();

    if (existErr) return NextResponse.json({ ok: false, error: existErr.message }, { status: 400 });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Booking not found or access denied" }, { status: 404 });
    }

    const { data: updated, error: updateErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .update({ booking_status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("restaurant_id", ctx.restaurantId)
      .select("id, booking_status, updated_at")
      .maybeSingle();

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}