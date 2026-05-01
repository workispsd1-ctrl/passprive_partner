import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

const TAX_PERCENT = 15;

function toFixed2(v) {
  return Number(Number(v || 0).toFixed(2));
}

function randomCode(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isTableOccupied(row) {
  const booking = String(row?.booking_status || "").toUpperCase();
  const payment = String(row?.payment_status || "").toUpperCase();
  if (booking === "CANCELLED") return false;
  if (payment === "PAID" || payment === "COMPLETED") return false;
  return true;
}

function mergeOrderItems(existingItems, incomingItems) {
  const base = Array.isArray(existingItems) ? existingItems : [];
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const map = new Map();

  for (const item of base) {
    const key = String(item?.item_id || item?.id || item?.name || "").trim();
    if (!key) continue;
    map.set(key, {
      item_id: item?.item_id || key,
      name: item?.name || "",
      qty: Number(item?.qty || 0),
      unit_price: Number(item?.unit_price || 0),
      line_total: Number(item?.line_total || Number(item?.qty || 0) * Number(item?.unit_price || 0)),
    });
  }

  for (const item of incoming) {
    const key = String(item?.item_id || item?.id || item?.name || "").trim();
    if (!key) continue;
    const qty = Number(item?.qty || 0);
    const unit = Number(item?.unit_price || 0);
    const line = Number(item?.line_total || qty * unit);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        item_id: item?.item_id || key,
        name: item?.name || "",
        qty,
        unit_price: unit,
        line_total: line,
      });
      continue;
    }
    map.set(key, {
      ...prev,
      name: prev.name || item?.name || "",
      qty: Number(prev.qty || 0) + qty,
      line_total: Number(prev.line_total || 0) + line,
    });
  }

  return Array.from(map.values()).map((x) => ({
    ...x,
    qty: Number(Number(x.qty || 0).toFixed(3)),
    unit_price: toFixed2(x.unit_price || 0),
    line_total: toFixed2(x.line_total || 0),
  }));
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
        .select("table_no,booking_status,payment_status")
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

    return NextResponse.json({
      ok: true,
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
    const orderType = String(body?.order_type || "").trim().toUpperCase();
    const items = Array.isArray(body?.items) ? body.items : [];
    const notes = String(body?.notes || "").trim();
    const customerName = String(body?.customer_name || "Walk-in").trim() || "Walk-in";
    const customerPhone = String(body?.customer_phone || "").trim();
    const tableNo = Number(body?.table_no || 0);

    if (!["TABLE", "PICKUP"].includes(orderType)) {
      return NextResponse.json({ ok: false, error: "Invalid order_type." }, { status: 400 });
    }
    if (!items.length) return NextResponse.json({ ok: false, error: "No items selected." }, { status: 400 });
    if (orderType === "TABLE" && (!Number.isInteger(tableNo) || tableNo <= 0)) {
      return NextResponse.json({ ok: false, error: "Valid table number is required." }, { status: 400 });
    }

    const normalizedItems = items
      .map((it) => {
        const qty = Number(it?.qty || 0);
        const unit = Number(it?.unit_price || 0);
        return {
          item_id: String(it?.item_id || it?.id || it?.name || "").trim(),
          name: String(it?.name || "Item").trim(),
          qty: Number(qty.toFixed(3)),
          unit_price: toFixed2(unit),
          line_total: toFixed2(qty * unit),
        };
      })
      .filter((it) => it.item_id && it.qty > 0 && it.unit_price >= 0);

    if (!normalizedItems.length) {
      return NextResponse.json({ ok: false, error: "No valid items in cart." }, { status: 400 });
    }

    const subtotal = toFixed2(normalizedItems.reduce((sum, it) => sum + toFixed2(it.qty * it.unit_price), 0));
    const tax = toFixed2((subtotal * TAX_PERCENT) / 100);
    const total = toFixed2(subtotal + tax);

    if (orderType === "TABLE") {
      const { data: existingRows, error: existingErr } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, order_items, order_details, subtotal_amount, tax_amount, total_amount, booking_status, payment_status")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("table_no", tableNo)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 400 });

      const openExisting = (Array.isArray(existingRows) ? existingRows : []).find(isTableOccupied) || null;

      if (openExisting?.id) {
        const prevSubtotal = Number(openExisting.subtotal_amount || 0);
        const prevTax = Number(openExisting.tax_amount || 0);
        const prevTotal = Number(openExisting.total_amount || 0);
        const mergedItems = mergeOrderItems(openExisting.order_items, normalizedItems);
        const nextSubtotal = toFixed2(prevSubtotal + subtotal);
        const nextTax = toFixed2(prevTax + tax);
        const nextTotal = toFixed2(prevTotal + total);
        const prevDetails = openExisting.order_details && typeof openExisting.order_details === "object" ? openExisting.order_details : {};

        const { data: updatedRows, error: updateErr } = await ctx.admin
          .from("restaurant_table_bookings")
          .update({
            customer_name: customerName,
            customer_phone: customerPhone || null,
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
            booking_status: "PREPARING",
            source: "cashier",
            notes: notes || prevDetails?.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", openExisting.id)
          .select("id, table_no, total_amount, booking_status, payment_status");
        if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });
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
        booking_status: "PREPARING",
        source: "cashier",
        notes: notes || null,
      };

      const { data, error } = await ctx.admin
        .from("restaurant_table_bookings")
        .insert(payload)
        .select("id, table_no, total_amount, booking_status, payment_status")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
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
      },
      accepted_at: now.toISOString(),
    };
    const { data, error } = await ctx.admin
      .from("restaurant_orders")
      .insert(pickupPayload)
      .select("id, order_number, total_amount, order_status, payment_status, pickup_code")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, order_type: "PICKUP", order: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
