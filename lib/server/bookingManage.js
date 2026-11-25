import { resolveWaiter } from "@/lib/server/waiters";
import { seatTable } from "@/lib/server/billItems";
import { isBillClosed } from "@/lib/server/tableBill";
export const MANUAL_SOURCES = ["partner", "phone", "walk_in", "admin"];
export const STAFF_STATUSES = ["confirmed", "completed", "no_show", "cancelled"];
export const COVER_METHODS = ["CASH", "CARD", "MAUCAS", "JUICE", "BANK"];
const ACTIVE = ["pending", "confirmed", "payment_successfull", "payment_successful"];
const DEFAULT_MINUTES = 90;

const fail = (status, error) => ({ status, body: { ok: false, error } });

export function bookingTableNo(row) {
  const col = Number(row?.table_no || 0);
  if (Number.isInteger(col) && col > 0) return col;
  const m = String(row?.notes_internal || "").match(/table_no\s*:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function minutesOf(value) {
  const [h, m] = String(value || "").slice(0, 5).split(":").map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
}

function span(row) {
  const start = minutesOf(row.booking_time);
  const length = Number(row.duration_minutes) > 0 ? Number(row.duration_minutes) : DEFAULT_MINUTES;
  return start == null ? null : [start, start + length];
}

export function findClash(target, others, tableNo) {
  const mine = span(target);
  if (!mine) return null;
  return (
    others.find((o) => {
      if (o.id === target.id || String(o.booking_date) !== String(target.booking_date)) return false;
      if (!ACTIVE.includes(String(o.status || "").toLowerCase())) return false;
      if (bookingTableNo(o) !== tableNo) return false;
      const theirs = span(o);
      return Boolean(theirs) && Math.max(mine[0], theirs[0]) < Math.min(mine[1], theirs[1]);
    }) || null
  );
}

export function coverPatch(cover) {
  const amount = Number(cover?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return { error: "Enter a cover charge between 0 and 100,000." };
  const cents = Math.round(amount * 100);
  const paid = Boolean(cover?.paid) && cents > 0;
  const method = String(cover?.method || "").toUpperCase();
  if (paid && !COVER_METHODS.includes(method)) return { error: "Pick how the cover charge was paid." };
  return {
    patch: {
      cover_charge_amount: cents / 100,
      payment_status: paid ? "paid" : "pending",
      payment_amount: paid ? cents / 100 : 0,
      payment_method: paid ? method : null,
      payment_reference: paid ? String(cover?.reference || "").trim().slice(0, 60) || null : null,
    },
  };
}

function withNotesTable(notes, tableNo) {
  const cleaned = String(notes || "").replace(/(?:^|\s)\[?table_no\s*:\s*\d+\]?/gi, "").trim();
  return tableNo ? `${cleaned}${cleaned ? " " : ""}[table_no:${tableNo}]`.trim() : cleaned || null;
}

const FIELDS =
  "id,source,status,booking_date,booking_time,duration_minutes,table_no,notes_internal,payment_status,payment_amount,cover_charge_amount,customer_name";

export async function manageBooking(ctx, body) {
  const id = String(body?.id || "").trim();
  if (!id) return fail(400, "id is required");
  const { data: row, error } = await ctx.admin.from("restaurant_bookings").select(FIELDS).eq("id", id).eq("restaurant_id", ctx.restaurantId).maybeSingle();
  if (error) return fail(400, "Could not load this booking.");
  if (!row) return fail(404, "This booking no longer exists.");

  const manual = MANUAL_SOURCES.includes(String(row.source || "").toLowerCase());
  const patch = {};

  if (body?.status !== undefined) {
    const status = String(body.status || "").toLowerCase();
    if (!STAFF_STATUSES.includes(status)) return fail(400, "Pick a valid status.");
    patch.status = status;
    if (status === "cancelled") {
      patch.cancelled_at = new Date().toISOString();
      patch.cancel_reason = String(body?.cancel_reason || "").trim().slice(0, 120) || "Cancelled by the restaurant";
    } else if (String(row.status || "").toLowerCase() === "cancelled") {
      patch.cancelled_at = null;
      patch.cancel_reason = null;
    }
  }

  if (body?.table_no !== undefined) {
    const tableNo = body.table_no === null || body.table_no === "" ? null : Number(body.table_no);
    if (tableNo !== null) {
      if (!Number.isInteger(tableNo) || tableNo <= 0) return fail(400, "Pick a table.");
      const { data: table } = await ctx.admin
        .from("restaurant_table_layouts")
        .select("table_no")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("table_no", tableNo)
        .maybeSingle();
      if (!table) return fail(400, "That table is not in your table layout.");
      if (!body?.force) {
        const { data: sameDay } = await ctx.admin
          .from("restaurant_bookings")
          .select("id,status,booking_date,booking_time,duration_minutes,table_no,notes_internal,customer_name")
          .eq("restaurant_id", ctx.restaurantId)
          .eq("booking_date", row.booking_date)
          .neq("id", row.id)
          .limit(500);
        const clash = findClash(row, sameDay || [], tableNo);
        if (clash) {
          return {
            status: 409,
            body: {
              ok: false,
              error: "table_taken",
              message: `Table ${tableNo} is already booked at ${String(clash.booking_time).slice(0, 5)} for ${clash.customer_name || "another guest"}.`,
            },
          };
        }
      }
    }
    patch.table_no = tableNo;
    patch.notes_internal = withNotesTable(row.notes_internal, tableNo);
  }

  if (body?.cover !== undefined) {
    if (!manual) return fail(403, "Cover charges for app bookings are paid by the guest in the app.");
    if (ctx.isWaiter) return fail(403, "Cover charge payments are recorded by the cashier.");
    const result = coverPatch(body.cover);
    if (result.error) return fail(400, result.error);
    Object.assign(patch, result.patch);
  }

  if (!Object.keys(patch).length) return fail(400, "Nothing to change.");
  const { data: saved, error: upErr } = await ctx.admin
    .from("restaurant_bookings")
    .update({ ...patch, read: true, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("restaurant_id", ctx.restaurantId)
    .select("id,status,table_no,cover_charge_amount,payment_status,payment_amount,payment_method,payment_reference,cancel_reason")
    .single();
  if (upErr) return fail(400, "Could not update this booking.");
  return { status: 200, body: { ok: true, booking: saved } };
}

export async function seatBooking(ctx, body) {
  const id = String(body?.id || "").trim();
  if (!id) return fail(400, "id is required");
  const { data: row, error } = await ctx.admin
    .from("restaurant_bookings")
    .select("id,source,status,booking_date,booking_time,table_no,notes_internal,customer_name,customer_phone,party_size,seated_at,seated_order_id,payment_status,payment_amount,payment_method,payment_reference")
    .eq("id", id)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();
  if (error) return fail(400, "Could not load this booking.");
  if (!row) return fail(404, "This booking no longer exists.");
  const status = String(row.status || "").toLowerCase();
  if (status === "cancelled" || status === "no_show") return fail(409, "This booking is cancelled or a no-show. Change its status first.");

  if (row.seated_order_id) {
    const { data: bill } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id,table_no,booking_status,payment_status")
      .eq("id", row.seated_order_id)
      .maybeSingle();
    if (bill && !isBillClosed(bill)) {
      return { status: 200, body: { ok: true, already: true, order_id: bill.id, table_no: Number(bill.table_no) } };
    }
  }

  const tableNo = body?.table_no != null && body.table_no !== "" ? Number(body.table_no) : bookingTableNo(row);
  if (!Number.isInteger(tableNo) || tableNo <= 0) return fail(400, "Pick a table for this booking.");
  const name = String(row.customer_name || "").trim() || "Reservation";
  const deposit = depositPart(row, ctx.userId);
  const picked = await resolveWaiter(ctx.admin, ctx.restaurantId, { callerId: ctx.userId, callerIsWaiter: Boolean(ctx.isWaiter), waiterId: body?.waiter_id });
  if (picked.error) return fail(400, picked.error);
  const seated = await seatTable(
    ctx.admin,
    ctx.restaurantId,
    ctx.userId,
    {
      table_no: tableNo,
      guest_count: Math.min(99, Math.max(1, Number(row.party_size) || 1)),
      customer_name: name,
      customer_phone: row.customer_phone || null,
      booking_id: row.id,
    },
    { deposit, openedBy: picked.waiter }
  );
  if (seated.status === 409) {
    return {
      status: 409,
      body: { ok: false, error: "table_taken", message: `Table ${tableNo} still has an open bill. Pick another table, or close that bill first.` },
    };
  }
  if (!seated.body.ok) return seated;
  const order = seated.body.order;
  const at = new Date().toISOString();
  const { data: saved, error: upErr } = await ctx.admin
    .from("restaurant_bookings")
    .update({
      status: "completed",
      table_no: Number(order.table_no),
      notes_internal: withNotesTable(row.notes_internal, Number(order.table_no)),
      seated_at: at,
      seated_order_id: order.id,
      cancelled_at: null,
      cancel_reason: null,
      read: true,
      updated_at: at,
    })
    .eq("id", row.id)
    .eq("restaurant_id", ctx.restaurantId)
    .select("id,status,table_no,seated_at,seated_order_id")
    .single();
  if (upErr) return { status: 200, body: { ok: true, order_id: order.id, table_no: Number(order.table_no), warning: "Table opened, but the booking was not updated." } };
  return { status: 200, body: { ok: true, order_id: order.id, table_no: Number(order.table_no), booking: saved, deposit: deposit?.amount || 0 } };
}

export function depositPart(row, userId) {
  const manual = MANUAL_SOURCES.includes(String(row?.source || "").toLowerCase());
  const amount = Math.round(Number(row?.payment_amount || 0) * 100);
  if (!manual || row?.seated_order_id || String(row?.payment_status || "") !== "paid" || amount <= 0) return null;
  return {
    id: `deposit:${row.id}`,
    no: 1,
    method: "DEPOSIT",
    deposit_method: String(row.payment_method || "").toUpperCase() || null,
    amount: amount / 100,
    tip: 0,
    received: amount / 100,
    change: 0,
    reference: row.payment_reference || null,
    booking_id: row.id,
    by: userId,
    at: new Date().toISOString(),
  };
}
