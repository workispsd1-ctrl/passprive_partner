import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

const TAX_PERCENT = 15;

function extractOrderItems(row) {
  if (Array.isArray(row?.order_items) && row.order_items.length) return row.order_items;
  const details = row?.order_details;
  if (details && typeof details === "object") {
    if (Array.isArray(details.items) && details.items.length) return details.items;
    if (Array.isArray(details.order_items) && details.order_items.length) return details.order_items;
    const snapshot = details.order_snapshot;
    if (snapshot && typeof snapshot === "object") {
      if (Array.isArray(snapshot.items) && snapshot.items.length) return snapshot.items;
      if (Array.isArray(snapshot.order_items) && snapshot.order_items.length) return snapshot.order_items;
    }
  }
  return [];
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const qty = Number(it?.qty || 0);
      const unit = Number(it?.unit_price || 0);
      const line = Number(it?.line_total || qty * unit);
      return {
        item_id: String(it?.item_id || it?.id || it?.name || "").trim(),
        name: String(it?.name || "Item").trim(),
        qty: Number(qty.toFixed(3)),
        unit_price: Number(unit.toFixed(2)),
        line_total: Number(line.toFixed(2)),
      };
    })
    .filter((it) => it.item_id && it.qty > 0 && it.unit_price >= 0 && it.line_total >= 0);
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const [layoutRes, ordersRes] = await Promise.all([
      ctx.admin
        .from("restaurant_table_layouts")
        .select("id, table_no, label, shape, capacity, pos_x, pos_y")
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true }),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, customer_name, customer_phone, order_items, order_details, notes, total_amount, booking_status, payment_status")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false }),
    ]);

    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });
    if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      restaurant_id: ctx.restaurantId,
      tables: layoutRes.data || [],
      orders: ordersRes.data || [],
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
    const tables = Array.isArray(body?.tables) ? body.tables : [];

    const rows = tables.map((t, idx) => ({
      id: t.id,
      restaurant_id: ctx.restaurantId,
      table_no: Number(t.table_no || idx + 1),
      label: String(t.label || `T${idx + 1}`),
      shape: String(t.shape || "square"),
      capacity: Number(t.capacity || 4),
      pos_x: Number(t.pos_x || 10),
      pos_y: Number(t.pos_y || 10),
    }));

    const { error } = await ctx.admin.from("restaurant_table_layouts").upsert(rows, { onConflict: "id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
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

    if (action === "cancel_item") {
      const orderId = String(body?.order_id || "").trim();
      const itemKey = String(body?.item_key || "").trim();
      if (!orderId || !itemKey) {
        return NextResponse.json({ ok: false, error: "order_id and item_key are required" }, { status: 400 });
      }

      const { data: row, error: rowErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, restaurant_id, order_items, order_details, subtotal_amount, tax_amount, total_amount, payment_status, booking_status")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
      if (!row?.id) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });

      const payment = String(row?.payment_status || "").toUpperCase();
      const booking = String(row?.booking_status || "").toUpperCase();
      if (["PAID", "COMPLETED"].includes(payment) || ["PAID", "COMPLETED", "CANCELLED", "SERVED"].includes(booking)) {
        return NextResponse.json({ ok: false, error: "Cannot cancel item on closed/paid order." }, { status: 400 });
      }

      const existingItems = normalizeItems(extractOrderItems(row));
      const filteredItems = existingItems.filter(
        (it) => String(it.item_id || it.name || "").toLowerCase() !== itemKey.toLowerCase()
      );
      if (filteredItems.length === existingItems.length) {
        return NextResponse.json({ ok: false, error: "Item not found in this order." }, { status: 404 });
      }

      const nextSubtotal = Number(
        filteredItems.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || 0), 0).toFixed(2)
      );
      const nextTax = Number(((nextSubtotal * TAX_PERCENT) / 100).toFixed(2));
      const nextTotal = Number((nextSubtotal + nextTax).toFixed(2));

      const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
      const prevSnapshot = prevDetails.order_snapshot && typeof prevDetails.order_snapshot === "object" ? prevDetails.order_snapshot : {};
      const updatedDetails = {
        ...prevDetails,
        items: filteredItems,
        order_items: filteredItems,
        order_snapshot: {
          ...prevSnapshot,
          items: filteredItems,
          order_items: filteredItems,
          subtotal_amount: nextSubtotal,
          tax_amount: nextTax,
          total_amount: nextTotal,
        },
      };

      const { data: updatedRows, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          order_items: filteredItems,
          order_details: updatedDetails,
          subtotal_amount: nextSubtotal,
          tax_amount: nextTax,
          total_amount: nextTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .select("id, order_items, subtotal_amount, tax_amount, total_amount");
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

      return NextResponse.json({
        ok: true,
        order: Array.isArray(updatedRows) ? updatedRows[0] || null : null,
      });
    }

    if (action === "update_order_state") {
      const orderId = String(body?.order_id || "").trim();
      const nextBookingStatus = String(body?.booking_status || "").trim().toUpperCase();
      const nextPaymentStatus = String(body?.payment_status || "").trim().toUpperCase();
      const allowedBooking = new Set(["PLACED", "CONFIRMED", "PREPARING", "SERVED", "COMPLETED"]);
      const allowedPayment = new Set(["PENDING", "PAID", "COMPLETED"]);
      if (!orderId) return NextResponse.json({ ok: false, error: "order_id is required" }, { status: 400 });
      if (!nextBookingStatus && !nextPaymentStatus) {
        return NextResponse.json({ ok: false, error: "booking_status or payment_status is required" }, { status: 400 });
      }
      if (nextBookingStatus && !allowedBooking.has(nextBookingStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid booking_status" }, { status: 400 });
      }
      if (nextPaymentStatus && !allowedPayment.has(nextPaymentStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid payment_status" }, { status: 400 });
      }

      const patch = { updated_at: new Date().toISOString() };
      if (nextBookingStatus) patch.booking_status = nextBookingStatus;
      if (nextPaymentStatus) patch.payment_status = nextPaymentStatus;
      if (nextPaymentStatus === "PAID" || nextPaymentStatus === "COMPLETED") {
        patch.booking_status = "COMPLETED";
        patch.payment_method = "CASH";
      }

      const { data: updatedRows, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update(patch)
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .select("id, booking_status, payment_status");
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      if (!Array.isArray(updatedRows) || !updatedRows.length) {
        return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, order: updatedRows[0] });
    }

    if (action !== "move_customers") {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    const fromTable = Number(body?.from_table || 0);
    const toTable = Number(body?.to_table || 0);
    if (!Number.isInteger(fromTable) || !Number.isInteger(toTable) || fromTable <= 0 || toTable <= 0 || fromTable === toTable) {
      return NextResponse.json({ ok: false, error: "Invalid table numbers" }, { status: 400 });
    }

    const { data: activeRows, error: activeErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id, booking_status, payment_status")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("table_no", fromTable);

    if (activeErr) return NextResponse.json({ ok: false, error: activeErr.message }, { status: 400 });

    const movableIds = (activeRows || [])
      .filter((row) => {
        const status = String(row?.booking_status || "").toUpperCase();
        const payment = String(row?.payment_status || "").toUpperCase();
        if (["CANCELLED", "PAID", "COMPLETED", "SERVED"].includes(status)) return false;
        if (["PAID", "COMPLETED"].includes(payment)) return false;
        return true;
      })
      .map((row) => row.id);

    if (!movableIds.length) {
      return NextResponse.json({ ok: false, error: `No active customers on T${fromTable}.` }, { status: 400 });
    }

    const { data: updatedRows, error: moveErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .update({ table_no: toTable, updated_at: new Date().toISOString() })
      .eq("restaurant_id", ctx.restaurantId)
      .in("id", movableIds)
      .select("id");

    if (moveErr) return NextResponse.json({ ok: false, error: moveErr.message }, { status: 400 });
    const movedCount = Array.isArray(updatedRows) ? updatedRows.length : 0;
    if (movedCount === 0) {
      return NextResponse.json({ ok: false, error: "Move failed: no orders were updated." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, moved_count: movedCount, from_table: fromTable, to_table: toTable });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
