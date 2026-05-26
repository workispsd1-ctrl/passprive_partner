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
    const restaurantId = clean(body?.restaurant_id);
    const deviceId = clean(body?.device_id);
    const tableNo = Number(body?.table_no);
    const items = Array.isArray(body?.items) ? body.items : [];
    const notes = clean(body?.notes);

    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurant_id is required" }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "device_id is required" }, { status: 400 });
    }
    if (!tableNo || tableNo < 1) {
      return NextResponse.json({ ok: false, error: "table_no is required" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: "Order must have at least one item" }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });
    }

    // Verify device is paired and active for this restaurant
    const { data: deviceRow, error: deviceErr } = await admin
      .from("restaurant_staff_devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (deviceErr) return NextResponse.json({ ok: false, error: deviceErr.message }, { status: 400 });
    if (!deviceRow?.device_id) {
      return NextResponse.json({ ok: false, error: "Device not authorised for this restaurant." }, { status: 403 });
    }

    // Build order items in the same shape the cashier UI expects
    const orderItems = items.map((item) => ({
      item_id: clean(item?.item_id),
      name: clean(item?.name),
      price: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
    }));

    const totalAmount = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const now = new Date().toISOString();
    const { data: inserted, error: insertErr } = await admin
      .from("restaurant_table_bookings")
      .insert({
        restaurant_id: restaurantId,
        table_no: tableNo,
        order_items: orderItems,
        order_details: { items: orderItems },
        total_amount: totalAmount,
        booking_status: "PLACED",
        payment_status: "PENDING",
        source: "staff_pad",
        notes: notes || null,
        customer_name: "Staff Order",
        customer_phone: "",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      order_id: inserted?.id,
      total_amount: totalAmount,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const restaurantId = clean(body?.restaurant_id);
    const deviceId = clean(body?.device_id);
    const orderId = clean(body?.order_id);
    const status = clean(body?.status).toUpperCase();

    const ALLOWED = ["CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "CANCELLED"];
    if (!restaurantId || !deviceId || !orderId) {
      return NextResponse.json({ ok: false, error: "restaurant_id, device_id and order_id are required" }, { status: 400 });
    }
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ ok: false, error: `status must be one of: ${ALLOWED.join(", ")}` }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: "Device not authorised." }, { status: 403 });
    }

    const { error: updateErr } = await admin
      .from("restaurant_table_bookings")
      .update({ booking_status: status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId);

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
