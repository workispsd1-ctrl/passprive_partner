import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

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

const PAYMENT_METHODS = ["CASH", "CARD", "JUICE", "OTHER"];

function isClosed(row) {
  const payment = String(row?.payment_status || "").toUpperCase();
  const booking = String(row?.booking_status || "").toUpperCase();
  return ["PAID", "COMPLETED"].includes(payment) || ["PAID", "COMPLETED", "CANCELLED"].includes(booking);
}

function totalsFor(items) {
  const subtotalCents = items.reduce((sum, it) => sum + Math.round(Number(it.unit_price || 0) * 100) * Number(it.qty || 0), 0);
  return {
    subtotal_amount: subtotalCents / 100,
    tax_amount: 0,
    total_amount: subtotalCents / 100,
  };
}

function mergeLines(base, extra) {
  const out = base.map((it) => ({ ...it }));
  for (const it of extra) {
    const hit = out.find((o) => o.item_id === it.item_id && o.unit_price === it.unit_price);
    if (hit) {
      hit.qty = Number((hit.qty + it.qty).toFixed(3));
      hit.line_total = Number((hit.qty * hit.unit_price).toFixed(2));
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const loadLayout = (columns) =>
      ctx.admin
        .from("restaurant_table_layouts")
        .select(columns)
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true });

    const [firstLayoutRes, areasRes, ordersRes] = await Promise.all([
      loadLayout("id, table_no, label, shape, capacity, pos_x, pos_y, area_id"),
      ctx.admin
        .from("restaurant_table_areas")
        .select("id, name, kind, sort_order, created_at")
        .eq("restaurant_id", ctx.restaurantId)
        .order("sort_order", { ascending: true }),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, customer_name, customer_phone, order_items, order_details, notes, total_amount, booking_status, payment_status, created_at, updated_at, source")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false }),
    ]);

    const layoutRes =
      firstLayoutRes.error?.code === "42703"
        ? await loadLayout("id, table_no, label, shape, capacity, pos_x, pos_y")
        : firstLayoutRes;
    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });
    if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      restaurant_id: ctx.restaurantId,
      tables: layoutRes.data || [],
      areas: areasRes.error ? [] : areasRes.data || [],
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

    if (tables.length > 200) return NextResponse.json({ ok: false, error: "Too many tables." }, { status: 400 });

    const { data: ownRows, error: ownErr } = await ctx.admin
      .from("restaurant_table_layouts")
      .select("id")
      .eq("restaurant_id", ctx.restaurantId);
    if (ownErr) return NextResponse.json({ ok: false, error: "Failed to load tables." }, { status: 500 });
    const ownIds = new Set((ownRows || []).map((r) => String(r.id)));
    if (tables.some((t) => t?.id && !ownIds.has(String(t.id)))) {
      return NextResponse.json({ ok: false, error: "One of these tables doesn't belong to your restaurant." }, { status: 403 });
    }

    const rows = tables.map((t, idx) => ({
      ...(t?.id ? { id: String(t.id) } : {}),
      restaurant_id: ctx.restaurantId,
      table_no: Number(t.table_no || idx + 1),
      label: String(t.label || `T${idx + 1}`),
      shape: String(t.shape || "square"),
      capacity: Number(t.capacity || 4),
      pos_x: Number(t.pos_x || 10),
      pos_y: Number(t.pos_y || 10),
    }));

    const existing = rows.filter((r) => r.id);
    const added = rows.filter((r) => !r.id);
    if (existing.length) {
      const { error } = await ctx.admin.from("restaurant_table_layouts").upsert(existing, { onConflict: "id" });
      if (error) {
        console.error("[cashier-table-layout]", error);
        return NextResponse.json({ ok: false, error: "Could not save tables. Check table numbers are unique." }, { status: 400 });
      }
    }
    if (added.length) {
      const { error } = await ctx.admin.from("restaurant_table_layouts").insert(added);
      if (error) {
        console.error("[cashier-table-layout]", error);
        return NextResponse.json({ ok: false, error: "Could not save tables. Check table numbers are unique." }, { status: 400 });
      }
    }

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

    if (action === "cancel_item" || action === "set_item_qty") {
      const orderId = String(body?.order_id || "").trim();
      const itemKey = String(body?.item_key || "").trim();
      const nextQty = action === "cancel_item" ? 0 : Number(body?.qty);
      const reason = String(body?.reason || "").trim().slice(0, 120);
      if (!orderId || !itemKey) {
        return NextResponse.json({ ok: false, error: "order_id and item_key are required" }, { status: 400 });
      }
      if (!Number.isInteger(nextQty) || nextQty < 0 || nextQty > 999) {
        return NextResponse.json({ ok: false, error: "Invalid quantity." }, { status: 400 });
      }

      const { data: row, error: rowErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, restaurant_id, order_items, order_details, subtotal_amount, tax_amount, total_amount, payment_status, booking_status")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
      if (!row?.id) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
      if (isClosed(row)) {
        return NextResponse.json({ ok: false, error: "This bill is already closed." }, { status: 400 });
      }

      const existingItems = normalizeItems(extractOrderItems(row));
      const idx = existingItems.findIndex(
        (it) => String(it.item_id || it.name || "").toLowerCase() === itemKey.toLowerCase()
      );
      if (idx < 0) return NextResponse.json({ ok: false, error: "Item not found in this order." }, { status: 404 });

      const line = existingItems[idx];
      if (nextQty < line.qty && !reason) {
        return NextResponse.json({ ok: false, error: "A reason is required to remove items." }, { status: 400 });
      }
      const nextItems =
        nextQty === 0
          ? existingItems.filter((_, i) => i !== idx)
          : existingItems.map((it, i) =>
              i === idx ? { ...it, qty: nextQty, line_total: Number((nextQty * it.unit_price).toFixed(2)) } : it
            );

      const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
      const voids = Array.isArray(prevDetails.voids) ? prevDetails.voids : [];
      const updatedDetails = {
        ...prevDetails,
        items: nextItems,
        order_items: nextItems,
        voids:
          nextQty < line.qty
            ? [...voids, { item_id: line.item_id, name: line.name, from_qty: line.qty, to_qty: nextQty, unit_price: line.unit_price, reason, by: ctx.userId, at: new Date().toISOString() }].slice(-200)
            : voids,
      };

      const totals = totalsFor(nextItems);
      const { data: updatedRows, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          order_items: nextItems,
          order_details: updatedDetails,
          ...totals,
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

    if (action === "settle") {
      const orderId = String(body?.order_id || "").trim();
      const method = String(body?.method || "").trim().toUpperCase();
      const reference = String(body?.reference || "").trim().slice(0, 60);
      const idempotencyKey = String(body?.idempotency_key || "").trim().slice(0, 64);
      if (!orderId || !idempotencyKey) {
        return NextResponse.json({ ok: false, error: "order_id and idempotency_key are required" }, { status: 400 });
      }
      if (!PAYMENT_METHODS.includes(method)) {
        return NextResponse.json({ ok: false, error: "Pick a payment method." }, { status: 400 });
      }

      const { data: row, error: rowErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, order_items, order_details, total_amount, payment_status, booking_status")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
      if (!row?.id) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });

      const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
      if (prevDetails.payment?.idempotency_key === idempotencyKey) {
        return NextResponse.json({ ok: true, payment: prevDetails.payment });
      }
      if (isClosed(row)) return NextResponse.json({ ok: false, error: "This bill is already closed." }, { status: 409 });

      const dueCents = Math.round(Number(row.total_amount || 0) * 100);
      if (dueCents <= 0 || !normalizeItems(extractOrderItems(row)).length) {
        return NextResponse.json({ ok: false, error: "There is nothing to pay on this bill." }, { status: 400 });
      }
      const receivedCents = method === "CASH" ? Math.round(Number(body?.amount_received) * 100) : dueCents;
      if (!Number.isFinite(receivedCents) || receivedCents < dueCents || receivedCents > dueCents + 10_000_000) {
        return NextResponse.json({ ok: false, error: "Amount received is less than the total." }, { status: 400 });
      }

      const payment = {
        method,
        amount_due: dueCents / 100,
        amount_received: receivedCents / 100,
        change: (receivedCents - dueCents) / 100,
        reference: reference || null,
        by: ctx.userId,
        at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
      };

      const { data: updated, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          payment_status: "PAID",
          booking_status: "COMPLETED",
          payment_method: method,
          payment_reference: reference || null,
          order_details: { ...prevDetails, payment },
          updated_at: payment.at,
        })
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .select("id");
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      if (!updated?.length) return NextResponse.json({ ok: false, error: "This bill is already closed." }, { status: 409 });

      return NextResponse.json({ ok: true, payment });
    }

    if (action === "void_order") {
      const orderId = String(body?.order_id || "").trim();
      const reason = String(body?.reason || "").trim().slice(0, 120);
      if (!orderId) return NextResponse.json({ ok: false, error: "order_id is required" }, { status: 400 });
      if (!reason) return NextResponse.json({ ok: false, error: "A reason is required to cancel a table." }, { status: 400 });

      const { data: row, error: rowErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, order_details, payment_status, booking_status, total_amount")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
      if (!row?.id) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
      if (isClosed(row)) return NextResponse.json({ ok: false, error: "This bill is already closed." }, { status: 400 });

      const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
      const { error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          booking_status: "CANCELLED",
          order_details: { ...prevDetails, void: { reason, by: ctx.userId, at: new Date().toISOString(), total_amount: row.total_amount } },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
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
      const query = ctx.admin.from("restaurant_table_bookings");
      if (nextPaymentStatus === "PAID" || nextPaymentStatus === "COMPLETED") {
        const { data: row } = await ctx.admin
          .from("restaurant_table_bookings")
          .select("order_details, total_amount, payment_status")
          .eq("id", orderId)
          .eq("restaurant_id", ctx.restaurantId)
          .maybeSingle();
        const prevDetails = row?.order_details && typeof row.order_details === "object" ? row.order_details : {};
        patch.booking_status = "COMPLETED";
        patch.payment_method = "CASH";
        if (!prevDetails.payment && !["PAID", "COMPLETED"].includes(String(row?.payment_status || "").toUpperCase())) {
          const due = Number(row?.total_amount || 0);
          patch.order_details = {
            ...prevDetails,
            payment: { method: "CASH", amount_due: due, amount_received: due, change: 0, reference: null, by: ctx.userId, at: patch.updated_at, via: "quick_mark" },
          };
        }
      }

      const { data: updatedRows, error: upErr } = await query
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

    if (action === "merge_tables") {
      const fromTable = Number(body?.from_table || 0);
      const toTable = Number(body?.to_table || 0);
      if (!Number.isInteger(fromTable) || !Number.isInteger(toTable) || fromTable <= 0 || toTable <= 0 || fromTable === toTable) {
        return NextResponse.json({ ok: false, error: "Invalid table numbers" }, { status: 400 });
      }

      const { data: rows, error: rowsErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, order_items, order_details, booking_status, payment_status, created_at")
        .eq("restaurant_id", ctx.restaurantId)
        .in("table_no", [fromTable, toTable]);
      if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 400 });

      const open = (rows || []).filter((r) => !isClosed(r));
      const sources = open.filter((r) => Number(r.table_no) === fromTable);
      if (!sources.length) return NextResponse.json({ ok: false, error: `No open bill on T${fromTable}.` }, { status: 400 });
      const targets = open
        .filter((r) => Number(r.table_no) === toTable)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

      const at = new Date().toISOString();
      if (!targets.length) {
        const { data: moved, error: moveErr } = await ctx.admin
          .from("restaurant_table_bookings")
          .update({ table_no: toTable, updated_at: at })
          .eq("restaurant_id", ctx.restaurantId)
          .in("id", sources.map((r) => r.id))
          .select("id");
        if (moveErr) return NextResponse.json({ ok: false, error: moveErr.message }, { status: 400 });
        return NextResponse.json({ ok: true, merged_count: moved?.length || 0, order_id: moved?.[0]?.id || null });
      }

      const target = targets[0];
      const absorbed = [...sources, ...targets.slice(1)];
      const closed = [];
      for (const row of absorbed) {
        const prev = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
        const { data: done } = await ctx.admin
          .from("restaurant_table_bookings")
          .update({
            booking_status: "CANCELLED",
            order_details: { ...prev, merged_into: { order_id: target.id, table_no: toTable, by: ctx.userId, at } },
            updated_at: at,
          })
          .eq("id", row.id)
          .eq("restaurant_id", ctx.restaurantId)
          .not("booking_status", "in", "(CANCELLED,COMPLETED,PAID)")
          .not("payment_status", "in", "(PAID,COMPLETED)")
          .select("id");
        if (done?.length) closed.push(row);
      }
      if (!closed.length) return NextResponse.json({ ok: false, error: "Those bills changed. Try again." }, { status: 409 });

      const restore = () =>
        Promise.all(
          closed.map((row) =>
            ctx.admin
              .from("restaurant_table_bookings")
              .update({ booking_status: row.booking_status, order_details: row.order_details, updated_at: new Date().toISOString() })
              .eq("id", row.id)
              .eq("restaurant_id", ctx.restaurantId)
          )
        );

      const nextItems = closed.reduce(
        (acc, row) => mergeLines(acc, normalizeItems(extractOrderItems(row))),
        normalizeItems(extractOrderItems(target))
      );
      const prevDetails = target.order_details && typeof target.order_details === "object" ? target.order_details : {};
      const mergedFrom = Array.isArray(prevDetails.merged_from) ? prevDetails.merged_from : [];
      const { data: updated, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          order_items: nextItems,
          order_details: {
            ...prevDetails,
            items: nextItems,
            order_items: nextItems,
            merged_from: [...mergedFrom, ...closed.map((r) => ({ order_id: r.id, table_no: Number(r.table_no), by: ctx.userId, at }))].slice(-50),
          },
          ...totalsFor(nextItems),
          updated_at: at,
        })
        .eq("id", target.id)
        .eq("restaurant_id", ctx.restaurantId)
        .not("booking_status", "in", "(CANCELLED,COMPLETED,PAID)")
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .select("id, total_amount");
      if (upErr || !updated?.length) {
        await restore();
        return NextResponse.json({ ok: false, error: upErr?.message || "That bill changed. Try again." }, { status: upErr ? 400 : 409 });
      }

      return NextResponse.json({ ok: true, merged_count: closed.length, order_id: target.id, total_amount: updated[0].total_amount });
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
