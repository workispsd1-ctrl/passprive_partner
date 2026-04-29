import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const booking = payload?.booking || null;
    const channel = payload?.channel || "whatsapp_call";
    const from = String(payload?.from || "7993291554");
    const to = String(payload?.to || "8331091122");

    if (!booking?.id) {
      return NextResponse.json({ ok: false, error: "booking.id is required" }, { status: 400 });
    }

    const webhookUrl = process.env.WHATSAPP_ALERT_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn("[BookingEscalation] No WHATSAPP_ALERT_WEBHOOK_URL configured", {
        bookingId: booking.id,
        restaurantId: booking.restaurant_id,
      });

      return NextResponse.json({
        ok: false,
        escalated: false,
        message: "No WhatsApp webhook configured. Add WHATSAPP_ALERT_WEBHOOK_URL.",
      });
    }

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "restaurant_booking_no_response",
        channel,
        from,
        to,
        trigger_after_seconds: 180,
        booking,
      }),
      cache: "no-store",
    });

    if (!resp.ok) {
      const body = await resp.text();
      return NextResponse.json(
        { ok: false, escalated: false, status: resp.status, error: body || "Webhook call failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, escalated: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, escalated: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
