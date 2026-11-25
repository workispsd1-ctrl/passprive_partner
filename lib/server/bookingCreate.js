import { manageBooking } from "@/lib/server/bookingManage";

export async function createBooking(ctx, body) {
  const bad = (error) => ({ status: 400, body: { ok: false, error } });
  const name = String(body?.customer_name || "").trim().slice(0, 80);
  const phone = String(body?.customer_phone || "").trim().slice(0, 20);
  const date = String(body?.booking_date || "");
  const time = String(body?.booking_time || "").slice(0, 5);
  const party = Number(body?.party_size);
  const note = String(body?.special_request || "").trim().slice(0, 500) || null;
  const takenBy = String((ctx.isWaiter && ctx.fullName ? ctx.fullName : body?.taken_by) || "").trim().slice(0, 60);

  if (!name) return bad("Guest name is required.");
  if (takenBy.length < 2) return bad("Enter the name of the staff member taking this booking.");
  if (phone.replace(/\D/g, "").length < 7) return bad("Enter a valid phone number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("Pick a date.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("Enter a time like 19:30.");
  if (!Number.isInteger(party) || party < 1 || party > 100) return bad("Party size must be 1 to 100.");

  const nowMu = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
  if (`${date} ${time}` < nowMu) return bad("That time has already passed.");

  const { data, error } = await ctx.admin
    .from("restaurant_bookings")
    .insert({
      restaurant_id: ctx.restaurantId,
      customer_name: name,
      customer_phone: phone,
      booking_date: date,
      booking_time: time,
      party_size: party,
      special_request: note,
      taken_by_name: takenBy,
      status: "confirmed",
      source: "partner",
      handled_by: "merchant",
      read: true,
    })
    .select("id")
    .single();
  if (error) return { status: 400, body: { ok: false, error: "Could not save the booking." } };
  const extras = {};
  if (body?.table_no) extras.table_no = body.table_no;
  if (body?.cover && Number(body.cover.amount) > 0) extras.cover = body.cover;
  if (Object.keys(extras).length) {
    const { body: out } = await manageBooking(ctx, { id: data.id, ...extras });
    if (!out.ok) return { status: 200, body: { ok: true, booking: data, warning: out.message || out.error } };
  }
  return { status: 200, body: { ok: true, booking: data } };
}
