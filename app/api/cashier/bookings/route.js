import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";
import { bookingTableNo, manageBooking, seatBooking } from "@/lib/server/bookingManage";

function parseHHMM(value) {
  const raw = String(value || "").slice(0, 5);
  const [h, m] = raw.split(":").map((x) => Number(x));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

async function createBooking(ctx, body) {
  const bad = (error) => NextResponse.json({ ok: false, error }, { status: 400 });
  const name = String(body?.customer_name || "").trim().slice(0, 80);
  const phone = String(body?.customer_phone || "").trim().slice(0, 20);
  const date = String(body?.booking_date || "");
  const time = String(body?.booking_time || "").slice(0, 5);
  const party = Number(body?.party_size);
  const note = String(body?.special_request || "").trim().slice(0, 500) || null;

  if (!name) return bad("Guest name is required.");
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
      status: "confirmed",
      source: "partner",
      handled_by: "merchant",
      read: true,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: "Could not save the booking." }, { status: 400 });
  const extras = {};
  if (body?.table_no) extras.table_no = body.table_no;
  if (body?.cover && Number(body.cover.amount) > 0) extras.cover = body.cover;
  if (Object.keys(extras).length) {
    const { body: out } = await manageBooking(ctx, { id: data.id, ...extras });
    if (!out.ok) return NextResponse.json({ ok: true, booking: data, warning: out.message || out.error });
  }
  return NextResponse.json({ ok: true, booking: data });
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const params = new URL(request.url).searchParams;
    const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
    const date = params.get("date") || "";
    const dayFilter = isDay(date) ? date : null;
    const from = params.get("from");
    const to = params.get("to");
    const span = isDay(from) && isDay(to) ? (Date.parse(to) - Date.parse(from)) / 86400000 : -1;
    const range = span >= 0 && span <= 400 ? { from, to } : null;
    const bookingQuery = ctx.admin
      .from("restaurant_bookings")
      .select("id,customer_name,customer_phone,customer_email,booking_date,booking_time,duration_minutes,party_size,status,source,created_at,booking_code,customer_booking_number,special_request,booked_slot_label,payment_status,payment_amount,payment_method,payment_reference,table_no,cancel_reason,notes_internal,read,proposed_at,cover_charge_amount,cover_request_status,cover_request_total,cover_request_due_at,updated_at,seated_at,seated_order_id")
      .eq("restaurant_id", ctx.restaurantId);

    const [bookingRes, tableOrderRes, layoutRes] = await Promise.all([
      dayFilter
        ? bookingQuery.eq("booking_date", dayFilter).order("booking_time", { ascending: true }).limit(500)
        : range
        ? bookingQuery.gte("booking_date", range.from).lte("booking_date", range.to).order("booking_date", { ascending: true }).order("booking_time", { ascending: true }).limit(3000)
        : bookingQuery.order("created_at", { ascending: false }).limit(200),
      (() => {
        let q = ctx.admin
          .from("restaurant_table_bookings")
          .select("id,table_no,customer_name,customer_phone,created_at,booking_status,payment_status,total_amount,subtotal_amount,tax_amount,order_items,notes")
          .eq("restaurant_id", ctx.restaurantId);
        if (range) q = q.gte("created_at", `${range.from}T00:00:00+04:00`).lte("created_at", `${range.to}T23:59:59+04:00`);
        return q.order("created_at", { ascending: false }).limit(1000);
      })(),
      ctx.admin
        .from("restaurant_table_layouts")
        .select("id,table_no,label,shape,capacity,pos_x,pos_y")
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true }),
    ]);

    if (bookingRes.error) return NextResponse.json({ ok: false, error: bookingRes.error.message }, { status: 400 });
    if (tableOrderRes.error) return NextResponse.json({ ok: false, error: tableOrderRes.error.message }, { status: 400 });
    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });

    const bookings = Array.isArray(bookingRes.data) ? bookingRes.data : [];
    const tableOrders = Array.isArray(tableOrderRes.data) ? tableOrderRes.data : [];
    const layouts = Array.isArray(layoutRes.data) ? layoutRes.data : [];

    const normalizedPhone = (v) => String(v || "").replace(/\D/g, "");
    const normalizedName = (v) => String(v || "").trim().toLowerCase();
    const dateOnly = (isoLike) => {
      if (!isoLike) return "";
      const str = String(isoLike);
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      const d = new Date(str);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    };

    const parseMappedTableNo = (row) => bookingTableNo(row);

    const activeBookingStatuses = new Set(["pending", "confirmed"]);

    const occupiedBySlot = new Map();
    for (const b of bookings) {
      const status = String(b?.status || "").toLowerCase();
      if (!activeBookingStatuses.has(status)) continue;
      const d = String(b?.booking_date || "");
      const start = parseHHMM(b?.booking_time);
      if (!d || start == null) continue;
      const duration = Number(b?.duration_minutes || 90);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 90);
      const mapped = parseMappedTableNo(b);
      if (!mapped || !Number.isInteger(mapped) || mapped <= 0) continue;
      const key = `${d}::${mapped}`;
      if (!occupiedBySlot.has(key)) occupiedBySlot.set(key, []);
      occupiedBySlot.get(key).push({ start, end, booking_id: b.id });
    }

    const autoAssigned = [];
    for (const b of bookings) {
      const mapped = parseMappedTableNo(b);
      const status = String(b?.status || "").toLowerCase();
      if (mapped || !activeBookingStatuses.has(status)) continue;
      const bookingDate = String(b?.booking_date || "");
      const start = parseHHMM(b?.booking_time);
      if (!bookingDate || start == null) continue;
      const duration = Number(b?.duration_minutes || 90);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 90);
      const members = Number(b?.party_size || 1);

      const sortedTables = [...layouts]
        .map((t) => ({
          table_no: Number(t?.table_no || 0),
          capacity: Number(t?.capacity || 0),
        }))
        .filter((t) => Number.isInteger(t.table_no) && t.table_no > 0 && t.capacity > 0)
        .sort((a, z) => a.table_no - z.table_no);

      const eligible = sortedTables
        .filter((t) => t.capacity >= members)
        .sort((a, z) => a.capacity - z.capacity || a.table_no - z.table_no);

      let chosen = null;
      for (const table of eligible) {
        const key = `${bookingDate}::${table.table_no}`;
        const slots = occupiedBySlot.get(key) || [];
        const clash = slots.some((s) => overlapMinutes(start, end, s.start, s.end));
        if (!clash) {
          chosen = table.table_no;
          if (!occupiedBySlot.has(key)) occupiedBySlot.set(key, []);
          occupiedBySlot.get(key).push({ start, end, booking_id: b.id });
          break;
        }
      }
      if (chosen) {
        autoAssigned.push({ id: b.id, table_no: chosen, notes_internal: b.notes_internal || "" });
      }
    }

    // Auto-assignment writes are deferred to POST action:"auto_assign_tables"
    // so GET remains read-only and idempotent.

    const decorated = bookings.map((b) => {
      const bDate = dateOnly(b.booking_date);
      const bPhone = normalizedPhone(b.customer_phone);
      const bName = normalizedName(b.customer_name);
      const manualMappedNo = parseMappedTableNo(b);
      const matchedOrder =
        tableOrders.find((o) => {
          const oDate = dateOnly(o.created_at);
          if (!bDate || !oDate || bDate !== oDate) return false;
          const oPhone = normalizedPhone(o.customer_phone);
          const oName = normalizedName(o.customer_name);
          if (bPhone && oPhone && bPhone === oPhone) return true;
          if (!bPhone && bName && oName && bName === oName) return true;
          return false;
        }) || null;
      const hasOrders = tableOrders.some((o) => {
        const oDate = dateOnly(o.created_at);
        if (!bDate || !oDate || bDate !== oDate) return false;
        const oPhone = normalizedPhone(o.customer_phone);
        const oName = normalizedName(o.customer_name);
        if (bPhone && oPhone && bPhone === oPhone) return true;
        if (!bPhone && bName && oName && bName === oName) return true;
        return false;
      });
      return {
        ...b,
        has_orders: hasOrders,
        matched_table_no: manualMappedNo || Number(matchedOrder?.table_no || 0) || null,
        matched_order_id: matchedOrder?.id || null,
      };
    });

    return NextResponse.json({
      ok: true,
      bookings: decorated,
      tables: layoutRes.data || [],
      table_orders: tableOrders,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();
    if (action === "create") return createBooking(ctx, body);
    if (action !== "auto_assign_tables") {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    const activeStatuses = new Set(["pending", "confirmed"]);

    const [bookingRes, layoutRes] = await Promise.all([
      ctx.admin
        .from("restaurant_bookings")
        .select("id,booking_date,booking_time,duration_minutes,party_size,status,notes_internal")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.admin
        .from("restaurant_table_layouts")
        .select("id,table_no,capacity")
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true }),
    ]);
    if (bookingRes.error) return NextResponse.json({ ok: false, error: bookingRes.error.message }, { status: 400 });
    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });

    const bookings = bookingRes.data || [];
    const layouts = layoutRes.data || [];

    const parseHHMM = (value) => {
      const raw = String(value || "").slice(0, 5);
      const [h, m] = raw.split(":").map((x) => Number(x));
      if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
      return h * 60 + m;
    };
    const overlapMinutes = (aStart, aEnd, bStart, bEnd) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
    const parseMappedTableNoLocal = (notes) => {
      const m = String(notes || "").match(/table_no\s*:\s*(\d+)/i);
      return m ? Number(m[1]) : null;
    };

    // Build time-slot occupancy from already-assigned active bookings
    const occupiedBySlot = new Map();
    for (const b of bookings) {
      if (!activeStatuses.has(String(b.status || "").toLowerCase())) continue;
      const mapped = parseMappedTableNoLocal(b.notes_internal);
      if (!mapped) continue;
      const d = String(b.booking_date || "");
      const start = parseHHMM(b.booking_time);
      if (!d || start == null) continue;
      const duration = Number(b.duration_minutes || 90);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 90);
      const key = `${d}::${mapped}`;
      if (!occupiedBySlot.has(key)) occupiedBySlot.set(key, []);
      occupiedBySlot.get(key).push({ start, end });
    }

    // Auto-assign unassigned active bookings to best-fit table
    const toWrite = [];
    for (const b of bookings) {
      if (!activeStatuses.has(String(b.status || "").toLowerCase())) continue;
      if (parseMappedTableNoLocal(b.notes_internal)) continue;
      const d = String(b.booking_date || "");
      const start = parseHHMM(b.booking_time);
      if (!d || start == null) continue;
      const duration = Number(b.duration_minutes || 90);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 90);
      const members = Number(b.party_size || 1);
      const eligible = layouts
        .map((t) => ({ table_no: Number(t.table_no || 0), capacity: Number(t.capacity || 0) }))
        .filter((t) => t.table_no > 0 && t.capacity >= members)
        .sort((a, z) => a.capacity - z.capacity || a.table_no - z.table_no);
      let chosen = null;
      for (const table of eligible) {
        const key = `${d}::${table.table_no}`;
        const slots = occupiedBySlot.get(key) || [];
        if (!slots.some((s) => overlapMinutes(start, end, s.start, s.end))) {
          chosen = table.table_no;
          if (!occupiedBySlot.has(key)) occupiedBySlot.set(key, []);
          occupiedBySlot.get(key).push({ start, end });
          break;
        }
      }
      if (chosen) toWrite.push({ id: b.id, table_no: chosen, notes_internal: b.notes_internal || "" });
    }

    for (const row of toWrite) {
      const base = String(row.notes_internal || "");
      const cleaned = base.replace(/(?:^|\s)\[?table_no\s*:\s*\d+\]?/gi, "").trim();
      const next = `${cleaned}${cleaned ? " " : ""}[table_no:${row.table_no}]`.trim();
      await ctx.admin
        .from("restaurant_bookings")
        .update({ notes_internal: next, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("restaurant_id", ctx.restaurantId);
    }

    return NextResponse.json({ ok: true, assigned_count: toWrite.length });
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
    const action = String(body?.action || "status").trim().toLowerCase();
    const id = String(body?.id || "").trim();
    if (action === "seat") {
      const { status: code, body: out } = await seatBooking(ctx, body);
      return NextResponse.json(out, { status: code });
    }
    if (action === "manage") {
      const { status: code, body: out } = await manageBooking(ctx, body);
      return NextResponse.json(out, { status: code });
    }
    const status = String(body?.status || "").trim().toLowerCase();
    const allowed = new Set(["pending", "confirmed", "payment_successfull", "completed", "cancelled", "no_show"]);
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

    if (action === "ack") {
      const { error } = await ctx.admin
        .from("restaurant_bookings")
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId);
      if (error) return NextResponse.json({ ok: false, error: "Could not update this booking." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "respond") {
      const response = String(body?.response || "").trim().toLowerCase();
      if (!["accept", "reject", "propose", "request_cover"].includes(response)) {
        return NextResponse.json({ ok: false, error: "Invalid response." }, { status: 400 });
      }
      const { data, error } = await ctx.admin.rpc("merchant_respond_booking", {
        p_restaurant_id: ctx.restaurantId,
        p_booking_id: id,
        p_action: response,
        p_reason: response === "reject" ? "Rejected by restaurant" : null,
        p_proposed_date: response === "propose" ? String(body?.proposed_date || "") : null,
        p_proposed_time: response === "propose" ? String(body?.proposed_time || "").slice(0, 5) : null,
        p_cover_amount: response === "request_cover" || response === "propose" ? Number(body?.cover_amount) || null : null,
        p_handled_by: "merchant",
      });
      if (error) return NextResponse.json({ ok: false, error: "generic" }, { status: 400 });
      return NextResponse.json(data?.ok ? { ok: true } : { ok: false, error: data?.error || "generic" }, {
        status: data?.ok ? 200 : 409,
      });
    }

    if (action === "map_table") {
      const tableNo = Number(body?.table_no || 0);
      if (!Number.isInteger(tableNo) || tableNo <= 0) {
        return NextResponse.json({ ok: false, error: "Valid table_no is required" }, { status: 400 });
      }

      // Fetch the booking being assigned so we know its date/time/duration
      const { data: existing, error: existingErr } = await ctx.admin
        .from("restaurant_bookings")
        .select("id,notes_internal,booking_date,booking_time,duration_minutes,status")
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .single();
      if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 400 });

      const activeStatuses = new Set(["pending", "confirmed"]);
      if (activeStatuses.has(String(existing.status || "").toLowerCase())) {
        // Check for overlap with other active bookings already assigned to this table on the same date
        const { data: clashCandidates, error: clashErr } = await ctx.admin
          .from("restaurant_bookings")
          .select("id,booking_time,duration_minutes,notes_internal,status")
          .eq("restaurant_id", ctx.restaurantId)
          .eq("booking_date", existing.booking_date)
          .neq("id", id);

        if (!clashErr && clashCandidates?.length) {
          const reqStart = parseHHMM(existing.booking_time);
          const reqDur = Number(existing.duration_minutes || 90);
          const reqEnd = reqStart + (Number.isFinite(reqDur) && reqDur > 0 ? reqDur : 90);

          const clash = clashCandidates.find((c) => {
            if (!activeStatuses.has(String(c.status || "").toLowerCase())) return false;
            const mapped = String(c.notes_internal || "").match(/table_no\s*:\s*(\d+)/i);
            if (!mapped || Number(mapped[1]) !== tableNo) return false;
            const cStart = parseHHMM(c.booking_time);
            if (cStart == null || reqStart == null) return false;
            const cDur = Number(c.duration_minutes || 90);
            const cEnd = cStart + (Number.isFinite(cDur) && cDur > 0 ? cDur : 90);
            return overlapMinutes(reqStart, reqEnd, cStart, cEnd);
          });

          if (clash) {
            return NextResponse.json(
              { ok: false, error: `Table ${tableNo} is already booked at that time. Please choose a different table.` },
              { status: 409 }
            );
          }
        }
      }

      const baseNotes = String(existing?.notes_internal || "");
      const withoutOld = baseNotes.replace(/(?:^|\s)\[?table_no\s*:\s*\d+\]?/gi, "").trim();
      const nextNotes = `${withoutOld}${withoutOld ? " " : ""}[table_no:${tableNo}]`.trim();
      const { data, error } = await ctx.admin
        .from("restaurant_bookings")
        .update({ notes_internal: nextNotes, table_no: tableNo, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .select("id,notes_internal")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, booking: data });
    }

    if (!allowed.has(status)) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });

    const { data, error } = await ctx.admin
      .from("restaurant_bookings")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", ctx.restaurantId)
      .select("id,status")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, booking: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
