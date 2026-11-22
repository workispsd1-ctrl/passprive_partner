import { NextResponse } from "next/server";
import { seatTable } from "@/lib/server/billItems";
import { resolveCashierRestaurant } from "../_shared";
import { fromCents, menuIndex, mergeLines, priceLines } from "@/lib/server/menuPricing";
import { isBillClosed } from "@/lib/server/tableBill";
import { queueOrderTicket, queueTakeawayReceipt } from "@/lib/server/printJobs";
import { guestsOf } from "@/lib/server/splitBill";
import { hostTable } from "@/lib/server/changeTable";

function toFixed2(v) {
  return Number(Number(v || 0).toFixed(2));
}

function randomCode(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isTableOccupied(row) {
  return !isBillClosed(row);
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const [restaurantRes, tablesRes, bookingsRes] = await Promise.all([
      ctx.admin.from("restaurants").select("id,name,menu_json").eq("id", ctx.restaurantId).maybeSingle(),
      ctx.admin
        .from("restaurant_table_layouts")
        .select("table_no,label")
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true }),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id,table_no,booking_status,payment_status,updated_at,guests:order_details->guests")
        .eq("restaurant_id", ctx.restaurantId),
    ]);

    if (restaurantRes.error) return NextResponse.json({ ok: false, error: restaurantRes.error.message }, { status: 400 });
    if (tablesRes.error) return NextResponse.json({ ok: false, error: tablesRes.error.message }, { status: 400 });
    if (bookingsRes.error) return NextResponse.json({ ok: false, error: bookingsRes.error.message }, { status: 400 });

    const rawMenu = restaurantRes.data?.menu_json;
    const menu =
      rawMenu && typeof rawMenu === "string"
        ? (() => {
            try {
              return JSON.parse(rawMenu);
            } catch {
              return null;
            }
          })()
        : rawMenu;

    const occupiedTableNos = Array.from(
      new Set(
        (Array.isArray(bookingsRes.data) ? bookingsRes.data : [])
          .filter(isTableOccupied)
          .map((r) => Number(r?.table_no || 0))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    ).sort((a, b) => a - b);

    const openBills = new Map();
    for (const r of (Array.isArray(bookingsRes.data) ? bookingsRes.data : []).filter(isTableOccupied)) {
      const no = Number(r?.table_no || 0);
      const prev = openBills.get(no);
      if (no > 0 && (!prev || String(r.updated_at) > String(prev.updated_at))) openBills.set(no, r);
    }

    return NextResponse.json({
      ok: true,
      open_bills: [...openBills.values()].map((r) => ({
        table_no: Number(r.table_no),
        order_id: r.id,
        guests: (Array.isArray(r.guests) ? r.guests : []).filter((g) => g?.id).map((g) => ({ id: g.id, name: g.name })),
      })),
      restaurant_id: ctx.restaurantId,
      restaurant_name: ctx.restaurantName,
      menu: menu && typeof menu === "object" ? menu : null,
      tables: tablesRes.data || [],
      occupied_table_nos: occupiedTableNos,
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

    if (body?.action === "seat") {
      const { status, body: out } = await seatTable(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return NextResponse.json(out, { status });
    }

    const orderType = String(body?.order_type || "").trim().toUpperCase();
    const items = Array.isArray(body?.items) ? body.items : [];
    const notes = String(body?.notes || "").trim();
    const customerName = String(body?.customer_name || "Walk-in").trim() || "Walk-in";
    const customerPhone = String(body?.customer_phone || "").trim();
    const tableNo = await hostTable(ctx.admin, ctx.restaurantId, Number(body?.table_no || 0));

    if (!["TABLE", "PICKUP"].includes(orderType)) {
      return NextResponse.json({ ok: false, error: "Invalid order_type." }, { status: 400 });
    }
    if (!items.length) return NextResponse.json({ ok: false, error: "No items selected." }, { status: 400 });
    if (orderType === "TABLE" && (!Number.isInteger(tableNo) || tableNo <= 0)) {
      return NextResponse.json({ ok: false, error: "Valid table number is required." }, { status: 400 });
    }

    const { data: menuRow, error: menuErr } = await ctx.admin
      .from("restaurants")
      .select("menu_json")
      .eq("id", ctx.restaurantId)
      .maybeSingle();
    if (menuErr) return NextResponse.json({ ok: false, error: menuErr.message }, { status: 400 });

    const rawLines = items.map((it) => ({
      item_id: it?.item_id ?? it?.id,
      variant_id: it?.variant_id,
      quantity: Number(it?.quantity ?? it?.qty),
      modifiers: it?.modifiers,
      note: it?.note,
      guest_id: it?.guest_id,
    }));
    const index = menuIndex(menuRow?.menu_json);
    const priced = priceLines(rawLines, index);
    if (!priced) {
      return NextResponse.json({ ok: false, error: "Some items are no longer on the menu. Refresh and try again." }, { status: 400 });
    }
    const normalizedItems = priced.lines;
    const subtotal = fromCents(priced.subtotalCents);
    const tax = 0;
    const total = subtotal;

    if (orderType === "TABLE") {
      const { data: existingRows, error: existingErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, customer_name, customer_phone, guest_count, order_items, order_details, subtotal_amount, tax_amount, total_amount, booking_status, payment_status, updated_at")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("table_no", tableNo)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 400 });

      const openExisting = (Array.isArray(existingRows) ? existingRows : []).find(isTableOccupied) || null;

      if (openExisting?.id) {
        const guests = guestsOf(openExisting);
        const guestLines = guests.length ? priceLines(rawLines, index, { guests })?.lines || normalizedItems : normalizedItems;
        const prevSubtotal = Number(openExisting.subtotal_amount || 0);
        const prevTax = Number(openExisting.tax_amount || 0);
        const prevTotal = Number(openExisting.total_amount || 0);
        const mergedItems = mergeLines(openExisting.order_items, guestLines);
        const nextSubtotal = toFixed2(prevSubtotal + subtotal);
        const nextTax = toFixed2(prevTax + tax);
        const nextTotal = toFixed2(prevTotal + total);
        const prevDetails = openExisting.order_details && typeof openExisting.order_details === "object" ? openExisting.order_details : {};

        const { data: updatedRows, error: updateErr } = await ctx.admin
          .from("restaurant_table_bookings")
          .update({
            customer_name: openExisting.customer_name || customerName,
            customer_phone: openExisting.customer_phone || customerPhone || null,
            order_items: mergedItems,
            order_details: {
              ...prevDetails,
              source_channel: "cashier_orders",
              cashier_user_id: ctx.userId,
              created_by: "cashier",
              last_append_at: new Date().toISOString(),
            },
            subtotal_amount: nextSubtotal,
            tax_amount: nextTax,
            total_amount: nextTotal,
            payment_method: "CASH",
            payment_status: "PENDING",
            booking_status: "PLACED",
            source: "cashier",
            notes: notes || prevDetails?.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", openExisting.id)
          .eq("restaurant_id", ctx.restaurantId)
          .eq("updated_at", openExisting.updated_at)
          .not("payment_status", "in", "(PAID,COMPLETED)")
          .select("id, table_no, total_amount, booking_status, payment_status");
        if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });
        if (!updatedRows?.length) {
          return NextResponse.json({ ok: false, error: "This table was just updated. Please try again." }, { status: 409 });
        }
        await queueOrderTicket(ctx.admin, ctx.restaurantId, {
          orderId: openExisting.id,
          tableNo,
          guests: openExisting.guest_count,
          lines: guestLines,
          added: Array.isArray(openExisting.order_items) && openExisting.order_items.length > 0,
          notes,
          source: "Till",
        });
        return NextResponse.json({ ok: true, order_type: "TABLE", continued: true, order: Array.isArray(updatedRows) ? updatedRows[0] || null : null });
      }

      const payload = {
        restaurant_id: ctx.restaurantId,
        table_no: tableNo,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        order_items: normalizedItems,
        order_details: {
          source_channel: "cashier_orders",
          cashier_user_id: ctx.userId,
          created_by: "cashier",
        },
        subtotal_amount: subtotal,
        tax_amount: tax,
        total_amount: total,
        payment_method: "CASH",
        payment_status: "PENDING",
        booking_status: "PLACED",
        source: "cashier",
        notes: notes || null,
      };

      const { data, error } = await ctx.admin
        .from("restaurant_table_bookings")
        .insert(payload)
        .select("id, table_no, total_amount, booking_status, payment_status")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      await queueOrderTicket(ctx.admin, ctx.restaurantId, { orderId: data.id, tableNo, lines: normalizedItems, notes, source: "Till" });
      return NextResponse.json({ ok: true, order_type: "TABLE", continued: false, order: data });
    }

    const now = new Date();
    const orderNumber = `PK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${randomCode("")}`;
    const pickupCode = randomCode("PK");
    const pickupPayload = {
      restaurant_id: ctx.restaurantId,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      items: normalizedItems,
      subtotal,
      tax_amount: tax,
      discount_amount: 0,
      total_amount: total,
      payment_method: "CASH",
      payment_status: "PENDING",
      order_status: "PREPARING",
      pickup_code: pickupCode,
      notes: notes || null,
      metadata: {
        source_channel: "cashier_orders",
        cashier_user_id: ctx.userId,
        takeaway: true,
      },
      accepted_at: now.toISOString(),
    };
    const { data, error } = await ctx.admin
      .from("restaurant_orders")
      .insert(pickupPayload)
      .select("id, order_number, total_amount, order_status, payment_status, pickup_code")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await queueOrderTicket(ctx.admin, ctx.restaurantId, {
      orderId: null,
      tableNo: null,
      lines: normalizedItems,
      notes,
      source: "Takeaway",
      takeaway: { name: customerName, code: pickupCode, number: orderNumber },
    }).catch((e) => console.error("takeaway ticket failed", e?.message));
    return NextResponse.json({ ok: true, order_type: "PICKUP", order: data });
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
    const id = String(body?.id || "").trim();
    const orderStatus = String(body?.order_status || "").trim().toUpperCase();
    const paymentStatus = String(body?.payment_status || "").trim().toUpperCase();

    const allowedOrderStatus = new Set(["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"]);
    const allowedPaymentStatus = new Set(["PENDING", "PAID"]);
    const allowedMethods = new Set(["CASH", "CARD", "MAUCAS", "JUICE"]);
    const paymentMethod = String(body?.payment_method || "CASH").trim().toUpperCase();
    if (paymentStatus === "PAID" && !allowedMethods.has(paymentMethod)) {
      return NextResponse.json({ ok: false, error: "Pick how the order was paid." }, { status: 400 });
    }

    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    if (!orderStatus && !paymentStatus) {
      return NextResponse.json({ ok: false, error: "order_status or payment_status is required" }, { status: 400 });
    }
    if (orderStatus && !allowedOrderStatus.has(orderStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid order_status" }, { status: 400 });
    }
    if (paymentStatus && !allowedPaymentStatus.has(paymentStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid payment_status" }, { status: 400 });
    }

    const patch = { updated_at: new Date().toISOString() };
    if (orderStatus) {
      patch.order_status = orderStatus;
      if (orderStatus === "ACCEPTED") patch.accepted_at = new Date().toISOString();
      if (orderStatus === "READY_FOR_PICKUP") patch.ready_at = new Date().toISOString();
      if (orderStatus === "PICKED_UP") patch.picked_up_at = new Date().toISOString();
      if (orderStatus === "CANCELLED") patch.cancelled_at = new Date().toISOString();
    }
    let before = null;
    if (paymentStatus === "PAID") {
      const { data: current } = await ctx.admin
        .from("restaurant_orders")
        .select("payment_status, metadata")
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      before = current;
      if (String(current?.payment_status || "").toUpperCase() === "PAID") {
        return NextResponse.json({ ok: false, error: "This order is already paid." }, { status: 409 });
      }
    }
    if (paymentStatus) {
      patch.payment_status = paymentStatus;
      if (paymentStatus === "PAID") {
        patch.payment_method = paymentMethod;
        const received = Number(body?.amount_received);
        patch.metadata = {
          ...(before?.metadata && typeof before.metadata === "object" ? before.metadata : {}),
          payment: { method: paymentMethod, by: ctx.userId, at: new Date().toISOString(), ...(Number.isFinite(received) && received > 0 ? { received } : {}) },
        };
      }
    }

    let query = ctx.admin.from("restaurant_orders").update(patch).eq("id", id).eq("restaurant_id", ctx.restaurantId);
    if (paymentStatus === "PAID") query = query.neq("payment_status", "PAID");
    const { data, error } = await query
      .select("id, order_number, order_status, payment_status, total_amount, pickup_code, customer_name, items")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data?.id) return NextResponse.json({ ok: false, error: "Pickup order not found." }, { status: 404 });

    if (paymentStatus === "PAID") {
      const received = Number(body?.amount_received);
      const total = Number(data.total_amount || 0);
      await queueTakeawayReceipt(ctx.admin, ctx.restaurantId, data, {
        method: paymentMethod,
        received: paymentMethod === "CASH" && received >= total ? received : total,
        change: paymentMethod === "CASH" && received > total ? Number((received - total).toFixed(2)) : 0,
      }).catch((e) => console.error("takeaway receipt failed", e?.message));
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
