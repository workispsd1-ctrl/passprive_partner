import { bookingTableNo } from "@/lib/server/bookingManage";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;

    const body = await readJson(request);
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply({ ok: false, error: "invalid_date" }, 400);

    const [{ data, error }, { data: tables }] = await Promise.all([
      ctx.admin
        .from("restaurant_bookings")
        .select("id,customer_name,customer_phone,customer_email,booking_date,booking_time,duration_minutes,party_size,status,source,created_at,booking_code,customer_booking_number,special_request,table_no,notes_internal,cover_charge_amount,payment_status,payment_amount,payment_method,payment_reference,cancel_reason,cover_request_status,cover_request_total,proposed_at,seated_at,seated_order_id")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("booking_date", date)
        .order("booking_time", { ascending: true })
        .limit(500),
      ctx.admin.from("restaurant_table_layouts").select("table_no,label,capacity").eq("restaurant_id", ctx.restaurantId).order("table_no", { ascending: true }),
    ]);
    if (error) return serverError(error);

    return reply({
      ok: true,
      bookings: (data || []).map((b) => ({ ...b, table_no: bookingTableNo(b) })),
      tables: tables || [],
    });
  } catch (error) {
    return serverError(error);
  }
}
