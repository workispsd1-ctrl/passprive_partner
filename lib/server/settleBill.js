import { isBillClosed } from "@/lib/server/tableBill";

export const PAYMENT_METHODS = ["CASH", "CARD", "MAUCAS", "JUICE", "CHEQUE", "AVOIR", "OTHER"];

const NEEDS_REFERENCE = ["CHEQUE", "AVOIR"];

const SETTLE_ATTEMPTS = 3;

export function extractOrderItems(row) {
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

export function normalizeItems(items) {
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

const fail = (status, error) => ({ status, body: { ok: false, error } });
const text = (value, max) => String(value || "").trim().slice(0, max) || null;

function gatewayRecord(gateway) {
  if (!gateway || typeof gateway !== "object") return null;
  return {
    merchant_ref: text(gateway.merchant_ref, 64),
    auth_code: text(gateway.auth_code, 20),
    rrn: text(gateway.rrn, 32),
    trace_no: text(gateway.trace_no, 20),
    batch_no: text(gateway.batch_no, 20),
    card_type: text(gateway.card_type, 40),
    last4: text(gateway.last4, 4),
    terminal_id: text(gateway.terminal_id, 64),
  };
}

export async function settleTableBill(admin, restaurantId, userId, body) {
  const orderId = String(body?.order_id || "").trim();
  const method = String(body?.method || "").trim().toUpperCase();
  const reference = String(body?.reference || "").trim().slice(0, 60);
  const idempotencyKey = String(body?.idempotency_key || "").trim().slice(0, 64);
  if (!orderId || !idempotencyKey) return fail(400, "order_id and idempotency_key are required");
  if (!PAYMENT_METHODS.includes(method)) return fail(400, "Pick a payment method.");
  if (NEEDS_REFERENCE.includes(method) && !reference) return fail(400, "Enter the reference number.");

  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    const { data: row, error: rowErr } = await admin
      .from("restaurant_table_bookings")
      .select("id, order_items, order_details, total_amount, payment_status, booking_status, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (rowErr) return fail(400, rowErr.message);
    if (!row?.id) return fail(404, "Order not found.");

    const prevDetails = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
    if (prevDetails.payment?.idempotency_key === idempotencyKey) {
      return { status: 200, body: { ok: true, payment: prevDetails.payment } };
    }
    if (isBillClosed(row)) return fail(409, "This bill is already closed.");

    const dueCents = Math.round(Number(row.total_amount || 0) * 100);
    if (dueCents <= 0 || !normalizeItems(extractOrderItems(row)).length) {
      return fail(400, "There is nothing to pay on this bill.");
    }
    const gateway = gatewayRecord(body?.gateway);
    const cashCents = Math.round(Number(body?.cash_amount || 0) * 100);
    if (!Number.isFinite(cashCents) || cashCents < 0 || cashCents >= dueCents || (cashCents > 0 && method === "CASH")) {
      return fail(400, "Invalid cash amount.");
    }
    if (body?.paid_cents !== undefined && Number(body.paid_cents) !== dueCents - cashCents) {
      return fail(409, "amount_mismatch");
    }
    const receivedCents = method === "CASH" ? Math.round(Number(body?.amount_received) * 100) : dueCents;
    if (!Number.isFinite(receivedCents) || receivedCents < dueCents || receivedCents > dueCents + 10_000_000) {
      return fail(400, "Amount received is less than the total.");
    }

    const payment = {
      method,
      amount_due: dueCents / 100,
      amount_received: receivedCents / 100,
      change: (receivedCents - dueCents) / 100,
      reference: reference || null,
      by: userId,
      at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      ...(gateway ? { gateway } : {}),
      ...(cashCents > 0
        ? {
            split: [
              { method: "CASH", amount: cashCents / 100 },
              { method, amount: (dueCents - cashCents) / 100 },
            ],
          }
        : {}),
    };

    const { data: updated, error: upErr } = await admin
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
      .eq("restaurant_id", restaurantId)
      .not("payment_status", "in", "(PAID,COMPLETED)")
      .neq("booking_status", "PAID")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (upErr) return fail(400, upErr.message);
    if (updated?.length) return { status: 200, body: { ok: true, payment } };
  }

  return fail(409, "This bill changed while paying. Check it and try again.");
}
