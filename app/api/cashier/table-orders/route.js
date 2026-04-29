import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const { data, error } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id,table_no,customer_name,customer_phone,order_items,order_details,total_amount,payment_status,booking_status,notes,created_at")
      .eq("restaurant_id", ctx.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, orders: data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const booking_status = String(body?.booking_status || "").trim().toUpperCase();
    const allowed = new Set(["PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED", "CANCELLED"]);

    if (!id || !allowed.has(booking_status)) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const { error } = await ctx.admin
      .from("restaurant_table_bookings")
      .update({ booking_status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", ctx.restaurantId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
