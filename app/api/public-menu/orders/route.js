import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isOpen(row) {
  const booking = String(row?.booking_status || "").toUpperCase();
  const payment = String(row?.payment_status || "").toUpperCase();
  const bookingClosed = booking === "CANCELLED";
  const paymentClosed = payment === "PAID" || payment === "COMPLETED";
  return !bookingClosed && !paymentClosed;
}

function canAppendItems(row) {
  const booking = String(row?.booking_status || "").toUpperCase();
  const payment = String(row?.payment_status || "").toUpperCase();
  if (booking === "CANCELLED") return false;
  if (payment === "PAID" || payment === "COMPLETED") return false;
  if (booking === "COMPLETED") return false;
  return true;
}

function mergeOrderItems(existingItems, incomingItems) {
  const base = Array.isArray(existingItems) ? existingItems : [];
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const map = new Map();

  for (const item of base) {
    const key = String(item?.item_id || item?.id || item?.name || "");
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
    const key = String(item?.item_id || item?.id || item?.name || "");
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
    const nextQty = Number(prev.qty || 0) + qty;
    const nextLine = Number(prev.line_total || 0) + line;
    map.set(key, {
      ...prev,
      name: prev.name || item?.name || "",
      qty: nextQty,
      line_total: nextLine,
    });
  }

  return Array.from(map.values()).map((x) => ({
    ...x,
    qty: Number(Number(x.qty || 0).toFixed(3)),
    unit_price: Number(Number(x.unit_price || 0).toFixed(2)),
    line_total: Number(Number(x.line_total || 0).toFixed(2)),
  }));
}

export async function POST(request) {
  try {
    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "find_open_by_session") {
      const sid = String(body?.session_id || "").trim();
      if (!sid) return NextResponse.json({ ok: true, order: null });
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .select("id, session_id, booking_status, payment_status, updated_at")
        .eq("session_id", sid)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, order: data && isOpen(data) ? data : null });
    }

    if (action === "find_open_by_table") {
      const restaurantId = String(body?.restaurant_id || "").trim();
      const tableNo = Number(body?.table_no || 0);
      if (!restaurantId || !Number.isInteger(tableNo) || tableNo <= 0) return NextResponse.json({ ok: true, order: null });
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .select("id, session_id, booking_status, payment_status, updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("table_no", tableNo)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const open = (Array.isArray(data) ? data : []).find(isOpen) || null;
      return NextResponse.json({ ok: true, order: open });
    }

    if (action === "get_status") {
      const orderId = String(body?.order_id || "").trim();
      if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .select("id, booking_status, payment_status, payment_method, customer_name, customer_phone, notes, order_items, subtotal_amount, tax_amount, total_amount, updated_at")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, order: data || null });
    }

    if (action === "upsert") {
      let targetOrderId = String(body?.target_order_id || "").trim();
      const payload = body?.payload || null;
      const billReady = Boolean(body?.bill_ready);
      if (!payload || typeof payload !== "object") return NextResponse.json({ ok: false, error: "payload required" }, { status: 400 });

      const payloadSessionId = String(payload?.session_id || "").trim();
      const payloadRestaurantId = String(payload?.restaurant_id || "").trim();
      const payloadTableNo = Number(payload?.table_no || 0);

      // Guard against stale client pointers: never append into a closed/paid order.
      if (targetOrderId) {
        const { data: targetRow, error: targetErr } = await admin
          .from("restaurant_table_bookings")
          .select("id, booking_status, payment_status, updated_at")
          .eq("id", targetOrderId)
          .maybeSingle();
        if (targetErr) throw targetErr;
        if (!targetRow || !canAppendItems(targetRow)) {
          targetOrderId = "";
        }
      }

      if (!targetOrderId && payloadSessionId) {
        const { data: bySession } = await admin
          .from("restaurant_table_bookings")
          .select("id, booking_status, payment_status, updated_at")
          .eq("session_id", payloadSessionId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bySession && canAppendItems(bySession)) {
          targetOrderId = String(bySession.id);
        }
      }

      if (!targetOrderId && payloadRestaurantId && Number.isInteger(payloadTableNo) && payloadTableNo > 0) {
        const { data: byTable } = await admin
          .from("restaurant_table_bookings")
          .select("id, booking_status, payment_status, updated_at")
          .eq("restaurant_id", payloadRestaurantId)
          .eq("table_no", payloadTableNo)
          .order("updated_at", { ascending: false })
          .limit(10);
        const openByTable = (Array.isArray(byTable) ? byTable : []).find(canAppendItems) || null;
        if (openByTable?.id) targetOrderId = String(openByTable.id);
      }

      if (!targetOrderId) {
        const { data, error } = await admin
          .from("restaurant_table_bookings")
          .insert({ ...payload, booking_status: "PLACED" })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, order_id: data?.id || null });
      }

      const updatePayload = billReady
        ? { ...payload, updated_at: new Date().toISOString() }
        : { ...payload, booking_status: "PLACED", updated_at: new Date().toISOString() };

      const { data: existingRow, error: existingErr } = await admin
        .from("restaurant_table_bookings")
        .select("id, order_items, order_details, subtotal_amount, tax_amount, total_amount")
        .eq("id", targetOrderId)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingRow?.id) {
        const prevSubtotal = Number(existingRow.subtotal_amount || 0);
        const prevTax = Number(existingRow.tax_amount || 0);
        const prevTotal = Number(existingRow.total_amount || 0);
        const nextSubtotal = prevSubtotal + Number(payload?.subtotal_amount || 0);
        const nextTax = prevTax + Number(payload?.tax_amount || 0);
        const nextTotal = prevTotal + Number(payload?.total_amount || 0);

        updatePayload.order_items = mergeOrderItems(existingRow.order_items, payload?.order_items);
        updatePayload.order_details = {
          ...(existingRow.order_details && typeof existingRow.order_details === "object" ? existingRow.order_details : {}),
          ...(payload?.order_details && typeof payload.order_details === "object" ? payload.order_details : {}),
        };
        updatePayload.subtotal_amount = Number(nextSubtotal.toFixed(2));
        updatePayload.tax_amount = Number(nextTax.toFixed(2));
        updatePayload.total_amount = Number(nextTotal.toFixed(2));
      }

      const { data, error } = await admin
        .from("restaurant_table_bookings")
        .update(updatePayload)
        .eq("id", targetOrderId)
        .select("id");
      // important: no error can still mean 0 matched rows
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        const { data: inserted, error: insertErr } = await admin
          .from("restaurant_table_bookings")
          .insert({ ...payload, booking_status: "PLACED" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        return NextResponse.json({ ok: true, order_id: inserted?.id || null });
      }
      return NextResponse.json({ ok: true, order_id: targetOrderId });
    }

    if (action === "mark_cash") {
      const orderId = String(body?.order_id || "").trim();
      if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
      const { error } = await admin
        .from("restaurant_table_bookings")
        .update({ payment_method: "CASH", payment_status: "PENDING", updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
