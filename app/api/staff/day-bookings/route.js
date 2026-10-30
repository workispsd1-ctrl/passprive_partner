import { readJson, reply, requireTerminal, serverError } from "../_terminal";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;

    const body = await readJson(request);
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply({ ok: false, error: "invalid_date" }, 400);

    const { data, error } = await ctx.admin
      .from("restaurant_bookings")
      .select("id,customer_name,customer_phone,customer_email,booking_date,booking_time,duration_minutes,party_size,status,source,created_at,booking_code,customer_booking_number,special_request")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("booking_date", date)
      .order("booking_time", { ascending: true })
      .limit(500);
    if (error) return serverError(error);

    return reply({ ok: true, bookings: data || [] });
  } catch (error) {
    return serverError(error);
  }
}
