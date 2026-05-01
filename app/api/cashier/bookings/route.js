import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

function parseHHMM(value) {
  const raw = String(value || "").slice(0, 5);
  const [h, m] = raw.split(":").map((x) => Number(x));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const [bookingRes, tableOrderRes, layoutRes] = await Promise.all([
      ctx.admin
        .from("restaurant_bookings")
        .select("id,customer_name,customer_phone,booking_date,booking_time,duration_minutes,party_size,status,created_at,booking_code,special_request,booked_slot_label,payment_status,notes_internal")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id,table_no,customer_name,customer_phone,created_at,booking_status,payment_status,total_amount,subtotal_amount,tax_amount,order_items,notes")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(1000),
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

    const parseMappedTableNo = (notesInternal) => {
      const raw = String(notesInternal || "");
      const m = raw.match(/table_no\s*:\s*(\d+)/i);
      return m ? Number(m[1]) : null;
    };

    const activeBookingStatuses = new Set(["pending", "confirmed", "payment_successfull"]);

    const occupiedBySlot = new Map();
    for (const b of bookings) {
      const status = String(b?.status || "").toLowerCase();
      if (!activeBookingStatuses.has(status)) continue;
      const d = String(b?.booking_date || "");
      const start = parseHHMM(b?.booking_time);
      if (!d || start == null) continue;
      const duration = Number(b?.duration_minutes || 90);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 90);
      const mapped = parseMappedTableNo(b?.notes_internal);
      if (!mapped || !Number.isInteger(mapped) || mapped <= 0) continue;
      const key = `${d}::${mapped}`;
      if (!occupiedBySlot.has(key)) occupiedBySlot.set(key, []);
      occupiedBySlot.get(key).push({ start, end, booking_id: b.id });
    }

    const autoAssigned = [];
    for (const b of bookings) {
      const mapped = parseMappedTableNo(b?.notes_internal);
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

    if (autoAssigned.length) {
      for (const row of autoAssigned) {
        const baseNotes = String(row.notes_internal || "");
        const withoutOld = baseNotes.replace(/(?:^|\s)\[?table_no\s*:\s*\d+\]?/gi, "").trim();
        const nextNotes = `${withoutOld}${withoutOld ? " " : ""}[table_no:${row.table_no}]`.trim();
        await ctx.admin
          .from("restaurant_bookings")
          .update({ notes_internal: nextNotes, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("restaurant_id", ctx.restaurantId);
      }
      const refreshed = await ctx.admin
        .from("restaurant_bookings")
        .select("id,customer_name,customer_phone,booking_date,booking_time,duration_minutes,party_size,status,created_at,booking_code,special_request,booked_slot_label,payment_status,notes_internal")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!refreshed.error && Array.isArray(refreshed.data)) {
        bookings.splice(0, bookings.length, ...refreshed.data);
      }
    }

    const decorated = bookings.map((b) => {
      const bDate = dateOnly(b.booking_date);
      const bPhone = normalizedPhone(b.customer_phone);
      const bName = normalizedName(b.customer_name);
      const manualMappedNo = parseMappedTableNo(b.notes_internal);
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

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const action = String(body?.action || "status").trim().toLowerCase();
    const id = String(body?.id || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();
    const allowed = new Set(["pending", "confirmed", "payment_successfull", "completed", "cancelled", "no_show"]);
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

    if (action === "map_table") {
      const tableNo = Number(body?.table_no || 0);
      if (!Number.isInteger(tableNo) || tableNo <= 0) {
        return NextResponse.json({ ok: false, error: "Valid table_no is required" }, { status: 400 });
      }
      const { data: existing, error: existingErr } = await ctx.admin
        .from("restaurant_bookings")
        .select("id,notes_internal")
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .single();
      if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 400 });
      const baseNotes = String(existing?.notes_internal || "");
      const withoutOld = baseNotes.replace(/(?:^|\s)\[?table_no\s*:\s*\d+\]?/gi, "").trim();
      const nextNotes = `${withoutOld}${withoutOld ? " " : ""}[table_no:${tableNo}]`.trim();
      const { data, error } = await ctx.admin
        .from("restaurant_bookings")
        .update({ notes_internal: nextNotes, updated_at: new Date().toISOString() })
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
