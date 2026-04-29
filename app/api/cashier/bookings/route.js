import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const { data, error } = await ctx.admin
      .from("restaurant_bookings")
      .select("id,customer_name,customer_phone,booking_date,booking_time,party_size,status,created_at,booking_code,special_request")
      .eq("restaurant_id", ctx.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, bookings: data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
