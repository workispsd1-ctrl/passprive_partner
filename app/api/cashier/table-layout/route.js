import { NextResponse } from "next/server";
import { setBillItemQty } from "@/lib/server/billItems";
import { addGuest, setItemGuest } from "@/lib/server/billGuests";
import { settleTableBill } from "@/lib/server/settleBill";
import { resolveCashierRestaurant } from "../_shared";
import { bookingStatusChangeError, isBillClosed, isBillPaid, quickPaymentRecord } from "@/lib/server/tableBill";
import { isQrPending, queueBillPrint, queueFinalPrint, queuePartPrint, queueShareBillPrint } from "@/lib/server/printJobs";
import { payBillPart } from "@/lib/server/splitBill";
import { changeTable } from "@/lib/server/changeTable";
import { cancelPayRequest, createPayBills, createPayRequest, orderPayRequests } from "@/lib/server/payRequests";

const TILL_METHODS = ["CASH", "AVOIR"];

const isClosed = isBillClosed;

async function releaseFinished(ctx, tables, orders) {
  const active = new Set((orders || []).filter((o) => !isClosed(o)).map((o) => Number(o.table_no)));
  const byId = new Map((tables || []).map((t) => [String(t.id), t]));
  const finished = (tables || []).filter((t) => {
    if (!t.attached_to || !t.attached_auto_release) return false;
    const host = byId.get(String(t.attached_to));
    return !active.has(Number(t.table_no)) && !(host && active.has(Number(host.table_no)));
  });
  if (!finished.length) return tables;
  const ids = finished.map((t) => t.id);
  const { error } = await ctx.admin
    .from("restaurant_table_layouts")
    .update({ attached_to: null, attached_auto_release: false })
    .eq("restaurant_id", ctx.restaurantId)
    .in("id", ids);
  if (error) return tables;
  return tables.map((t) => (ids.includes(t.id) ? { ...t, attached_to: null, attached_auto_release: false } : t));
}

function clearAttachment(ctx, tableNo) {
  return ctx.admin
    .from("restaurant_table_layouts")
    .update({ attached_to: null, attached_auto_release: false })
    .eq("restaurant_id", ctx.restaurantId)
    .eq("table_no", tableNo);
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
      loadLayout("id, table_no, label, shape, capacity, pos_x, pos_y, area_id, attached_to, attached_auto_release"),
      ctx.admin
        .from("restaurant_table_areas")
        .select("id, name, kind, sort_order, created_at, floor_objects, table_scale")
        .eq("restaurant_id", ctx.restaurantId)
        .order("sort_order", { ascending: true }),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, customer_name, customer_phone, order_items, order_details, notes, total_amount, booking_status, payment_status, created_at, updated_at, source")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false }),
    ]);

    let layoutRes = firstLayoutRes;
    if (layoutRes.error?.code === "42703") layoutRes = await loadLayout("id, table_no, label, shape, capacity, pos_x, pos_y, area_id");
    if (layoutRes.error?.code === "42703") layoutRes = await loadLayout("id, table_no, label, shape, capacity, pos_x, pos_y");
    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });
    if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 400 });
    const liveOrders = (ordersRes.data || []).filter((o) => !isQrPending(o));

    return NextResponse.json({
      ok: true,
      restaurant_id: ctx.restaurantId,
      tables: await releaseFinished(ctx, layoutRes.data || [], liveOrders),
      areas: areasRes.error ? [] : areasRes.data || [],
      orders: liveOrders,
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

    const money = ["pay_part", "request_pos_payment", "split_to_pos", "cancel_pos_payment", "settle", "void_order"].includes(action) ||
      (action === "update_order_state" && ["PAID", "COMPLETED"].includes(String(body?.payment_status || "").toUpperCase()));
    if (ctx.isWaiter && money) {
      return NextResponse.json({ ok: false, error: "Payments and cancelling tables are done by the cashier." }, { status: 403 });
    }

    if (action === "cancel_item" || action === "set_item_qty") {
      const { status, body: out } = await setBillItemQty(ctx.admin, ctx.restaurantId, ctx.userId, {
        ...body,
        qty: action === "cancel_item" ? 0 : body?.qty,
      });
      return NextResponse.json(out, { status });
    }

    if (action === "add_guest") {
      const { status, body: out } = await addGuest(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return NextResponse.json(out, { status });
    }

    if (action === "set_item_guest") {
      const { status, body: out } = await setItemGuest(ctx.admin, ctx.restaurantId, body);
      return NextResponse.json(out, { status });
    }

    if (action === "pay_part") {
      const tillMethod = String(body?.method || "").toUpperCase();
      if (!TILL_METHODS.includes(tillMethod)) {
        return NextResponse.json({ ok: false, error: "Card and MauCas are taken on the POS. Send the payment to the POS." }, { status: 400 });
      }
      const { status, body: out } = await payBillPart(ctx.admin, ctx.restaurantId, ctx.userId, { ...body, method: tillMethod });
      if (out.ok) await queuePartPrint(ctx.admin, ctx.restaurantId, String(body.order_id || ""), out);
      return NextResponse.json(out, { status });
    }

    if (action === "request_pos_payment") {
      const { status, body: out } = await createPayRequest(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return NextResponse.json(out, { status });
    }

    if (action === "split_to_pos") {
      const { status, body: out } = await createPayBills(ctx.admin, ctx.restaurantId, ctx.userId, body);
      const bills = Array.isArray(body?.bills) ? body.bills : [];
      for (const [i, request] of (out.requests || []).entries()) {
        if (bills[i]?.guest_id || bills[i]?.rest) {
          await queueShareBillPrint(ctx.admin, ctx.restaurantId, String(body?.order_id || ""), request).catch((e) => console.error("share bill print failed", e?.message));
        }
      }
      return NextResponse.json(out, { status });
    }

    if (action === "cancel_pos_payment") {
      const { status, body: out } = await cancelPayRequest(ctx.admin, ctx.restaurantId, ctx.userId, body, "cancelled");
      return NextResponse.json(out, { status });
    }

    if (action === "pos_payment_status") {
      const requests = await orderPayRequests(ctx.admin, ctx.restaurantId, String(body?.order_id || ""));
      return NextResponse.json({ ok: true, requests, request: requests[requests.length - 1] || null });
    }

    if (action === "settle") {
      if (!TILL_METHODS.includes(String(body?.method || "").toUpperCase())) {
        return NextResponse.json({ ok: false, error: "Card and MauCas are taken on the POS. Send the payment to the POS." }, { status: 400 });
      }
      const { status, body: out } = await settleTableBill(ctx.admin, ctx.restaurantId, ctx.userId, { ...body, method: String(body.method).toUpperCase() });
      if (out.ok) await queueFinalPrint(ctx.admin, ctx.restaurantId, String(body?.order_id || "")).catch((e) => console.error("final bill print queue failed", e?.message));
      return NextResponse.json(out, { status });
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
      if (Array.isArray(row.order_details?.payments) && row.order_details.payments.length) {
        return NextResponse.json({ ok: false, error: "Part of this bill is already paid, so the table can't be cancelled." }, { status: 409 });
      }
      const { data: held } = await ctx.admin
        .from("pos_payment_requests")
        .select("id")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("order_id", orderId)
        .eq("status", "pending")
        .limit(1);
      if (held?.length) {
        return NextResponse.json({ ok: false, error: "This bill is split. Cancel the split bills first." }, { status: 409 });
      }

      const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
      const { data: voided, error: upErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .update({
          booking_status: "CANCELLED",
          order_details: { ...prevDetails, void: { reason, by: ctx.userId, at: new Date().toISOString(), total_amount: row.total_amount } },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .neq("booking_status", "PAID")
        .select("id");
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      if (!voided?.length) return NextResponse.json({ ok: false, error: "This bill is already closed." }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    if (action === "update_order_state") {
      const orderId = String(body?.order_id || "").trim();
      const nextBookingStatus = String(body?.booking_status || "").trim().toUpperCase();
      const nextPaymentStatus = String(body?.payment_status || "").trim().toUpperCase();
      const allowedBooking = new Set(["COMPLETED"]);
      const allowedPayment = new Set(["PENDING", "PAID", "COMPLETED"]);
      if (!orderId) return NextResponse.json({ ok: false, error: "order_id is required" }, { status: 400 });
      if (!nextBookingStatus && !nextPaymentStatus) {
        return NextResponse.json({ ok: false, error: "booking_status or payment_status is required" }, { status: 400 });
      }
      if (nextBookingStatus && !allowedBooking.has(nextBookingStatus)) {
        return NextResponse.json({ ok: false, error: "The till can only mark a table completed." }, { status: 400 });
      }
      if (nextPaymentStatus && !allowedPayment.has(nextPaymentStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid payment_status" }, { status: 400 });
      }

      const patch = { updated_at: new Date().toISOString() };
      if (nextBookingStatus) patch.booking_status = nextBookingStatus;
      if (nextPaymentStatus) patch.payment_status = nextPaymentStatus;
      const { data: row, error: rowErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("order_details, total_amount, payment_status, booking_status")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
      if (!row) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
      const blocked = bookingStatusChangeError(row, nextBookingStatus, nextPaymentStatus);
      if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 409 });

      if (nextPaymentStatus === "PAID" || nextPaymentStatus === "COMPLETED") {
        if (Number(row.total_amount || 0) <= 0) {
          return NextResponse.json({ ok: false, error: "There is nothing to pay on this bill." }, { status: 400 });
        }
        const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
        patch.booking_status = "COMPLETED";
        patch.payment_method = "CASH";
        if (!prevDetails.payment && !isBillPaid(row)) {
          patch.order_details = { ...prevDetails, payment: quickPaymentRecord(row, ctx.userId, patch.updated_at) };
        }
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
      if (["PAID", "COMPLETED"].includes(nextPaymentStatus) && !isBillPaid(row)) {
        await queueFinalPrint(ctx.admin, ctx.restaurantId, orderId).catch((e) => console.error("final bill print queue failed", e?.message));
      } else if (nextBookingStatus === "COMPLETED" && !isBillPaid(row)) {
        await queueBillPrint(ctx.admin, ctx.restaurantId, orderId).catch((e) => console.error("bill print queue failed", e?.message));
      }
      return NextResponse.json({ ok: true, order: updatedRows[0] });
    }

    if (action === "attach_table") {
      const fromTable = Number(body?.from_table || 0);
      const toTable = Number(body?.to_table || 0);
      if (!Number.isInteger(fromTable) || !Number.isInteger(toTable) || fromTable <= 0 || toTable <= 0 || fromTable === toTable) {
        return NextResponse.json({ ok: false, error: "Invalid table numbers" }, { status: 400 });
      }

      const { data: layout, error: layoutErr } = await ctx.admin
        .from("restaurant_table_layouts")
        .select("id, table_no, attached_to")
        .eq("restaurant_id", ctx.restaurantId);
      if (layoutErr) {
        const missing = layoutErr.code === "42703";
        return NextResponse.json({ ok: false, error: missing ? "Attaching tables isn't set up on the server yet." : layoutErr.message }, { status: missing ? 503 : 400 });
      }
      const source = (layout || []).find((t) => Number(t.table_no) === fromTable);
      const target = (layout || []).find((t) => Number(t.table_no) === toTable);
      if (!source || !target) return NextResponse.json({ ok: false, error: "Table not found." }, { status: 404 });
      if (source.attached_to) return NextResponse.json({ ok: false, error: `T${fromTable} is already attached. Detach it first.` }, { status: 409 });
      if (target.attached_to) return NextResponse.json({ ok: false, error: `T${toTable} is attached to another table. Pick that table instead.` }, { status: 409 });
      if ((layout || []).some((t) => t.attached_to === source.id)) {
        return NextResponse.json({ ok: false, error: `Other tables are attached to T${fromTable}. Detach them first.` }, { status: 409 });
      }

      const { data: rows, error: rowsErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, booking_status, payment_status, created_at")
        .eq("restaurant_id", ctx.restaurantId)
        .in("table_no", [fromTable, toTable])
        .order("created_at", { ascending: true });
      if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 400 });
      const sourceBill = (rows || []).find((r) => !isClosed(r) && Number(r.table_no) === fromTable);
      if (!(rows || []).some((r) => !isClosed(r))) {
        return NextResponse.json({ ok: false, error: "Tables are joined only while they share a bill. Seat the guests first." }, { status: 409 });
      }
      let combined = null;
      if (sourceBill) {
        const { status, body: out } = await changeTable(ctx.admin, ctx.restaurantId, ctx.userId, { order_id: sourceBill.id, to_table: toTable });
        if (!out.ok) return NextResponse.json(out, { status });
        combined = out;
      }

      const { data: done, error: upErr } = await ctx.admin
        .from("restaurant_table_layouts")
        .update({ attached_to: target.id, attached_auto_release: true })
        .eq("id", source.id)
        .eq("restaurant_id", ctx.restaurantId)
        .is("attached_to", null)
        .select("id");
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      if (!done?.length) return NextResponse.json({ ok: false, error: `T${fromTable} is already attached. Detach it first.` }, { status: 409 });
      return NextResponse.json({ ok: true, bill: combined ? combined.mode : null, total_amount: combined?.total_amount ?? null });
    }

    if (action === "detach_table") {
      const tableNo = Number(body?.table_no || 0);
      if (!Number.isInteger(tableNo) || tableNo <= 0) {
        return NextResponse.json({ ok: false, error: "Invalid table number" }, { status: 400 });
      }
      const { error: upErr } = await clearAttachment(ctx, tableNo);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "change_table") {
      const { status, body: out } = await changeTable(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return NextResponse.json(out, { status });
    }

    if (action === "merge_tables" || action === "move_customers") {
      const fromTable = Number(body?.from_table || 0);
      const { data: rows, error: rowsErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, booking_status, payment_status, created_at")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("table_no", fromTable)
        .order("created_at", { ascending: true });
      if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 400 });
      const source = (rows || []).find((r) => !isClosed(r));
      if (!source) return NextResponse.json({ ok: false, error: `No open bill on T${fromTable}.` }, { status: 400 });
      const { status, body: out } = await changeTable(ctx.admin, ctx.restaurantId, ctx.userId, { order_id: source.id, to_table: body?.to_table });
      return NextResponse.json(out.ok ? { ...out, moved_count: 1, merged_count: out.mode === "merged" ? 1 : 0 } : out, { status });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
