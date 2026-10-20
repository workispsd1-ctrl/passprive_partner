import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/deviceSession";
import { restaurantHasPlan } from "@/lib/server/plan";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function serverError(error) {
  console.error("[booking-escalate]", error);
  return reply({ ok: false, escalated: false, error: "server_error" }, 500);
}

// Called by the dashboard when a new booking is still unread after 3 minutes. Only the restaurant's
// owner or staff can trigger it, the booking is read from the database, and the alert numbers come
// from server settings (WHATSAPP_ALERT_FROM / WHATSAPP_ALERT_TO), never from the request.
export async function POST(request) {
  try {
    const admin = serviceClient();
    if (!admin) return serverError("SUPABASE_SERVICE_ROLE_KEY is missing");

    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: auth } = token ? await admin.auth.getUser(token) : { data: null };
    const userId = auth?.user?.id;
    if (!userId) return reply({ ok: false, escalated: false, error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const bookingId = String(body?.booking_id || body?.booking?.id || "");
    if (!UUID_RE.test(bookingId)) return reply({ ok: false, escalated: false, error: "invalid_booking" }, 400);

    const { data: booking, error: bookingErr } = await admin
      .from("restaurant_bookings")
      .select("id, restaurant_id, customer_name, party_size, booking_date, booking_time, booking_code, status, read, restaurants:restaurant_id(name, owner_user_id)")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingErr) return serverError(bookingErr);
    if (!booking) return reply({ ok: false, escalated: false, error: "invalid_booking" }, 404);

    const restaurant = Array.isArray(booking.restaurants) ? booking.restaurants[0] : booking.restaurants;
    let allowed = restaurant?.owner_user_id === userId;
    if (!allowed) {
      const { data: staffRow, error: staffErr } = await admin
        .from("restaurant_staff")
        .select("user_id")
        .eq("restaurant_id", booking.restaurant_id)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (staffErr) return serverError(staffErr);
      allowed = Boolean(staffRow);
    }
    if (!allowed) return reply({ ok: false, escalated: false, error: "forbidden" }, 403);
    if (!(await restaurantHasPlan(admin, booking.restaurant_id))) {
      return reply({ ok: false, escalated: false, error: "not_in_plan" }, 403);
    }

    // Someone already saw it: nothing to escalate.
    if (booking.read === true) return reply({ ok: true, escalated: false });

    const webhookUrl = process.env.WHATSAPP_ALERT_WEBHOOK_URL;
    const from = process.env.WHATSAPP_ALERT_FROM;
    const to = process.env.WHATSAPP_ALERT_TO;
    if (!webhookUrl || !from || !to) return reply({ ok: true, escalated: false, reason: "not_configured" });

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "restaurant_booking_no_response",
        channel: "whatsapp_call",
        from,
        to,
        trigger_after_seconds: 180,
        booking: {
          id: booking.id,
          restaurant_id: booking.restaurant_id,
          restaurant_name: restaurant?.name || null,
          customer_name: booking.customer_name,
          party_size: booking.party_size,
          booking_date: booking.booking_date,
          booking_time: booking.booking_time,
          booking_code: booking.booking_code,
          status: booking.status,
        },
      }),
      cache: "no-store",
    });
    if (!resp.ok) return serverError(`webhook responded ${resp.status}`);

    return reply({ ok: true, escalated: true });
  } catch (error) {
    return serverError(error);
  }
}
