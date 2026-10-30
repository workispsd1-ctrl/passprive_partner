const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function mauritiusDayRange(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const start = new Date(`${date}T00:00:00+04:00`);
  if (Number.isNaN(start.getTime())) return null;
  if (new Date(start.getTime() + MAURITIUS_OFFSET_MS).toISOString().slice(0, 10) !== date) return null;
  return { start: start.toISOString(), end: new Date(start.getTime() + DAY_MS).toISOString() };
}

const toLine = (item) => ({
  name: String(item?.name || "Item"),
  qty: Number(item?.qty || 0),
  unit_price: Number(item?.unit_price || 0),
  line_total: Number(item?.line_total ?? Number(item?.unit_price || 0) * Number(item?.qty || 0)),
});

const lineList = (items) => (Array.isArray(items) ? items.map(toLine) : []);
const countItems = (lines) => lines.reduce((n, line) => n + line.qty, 0);
const shortId = (id) => String(id || "").slice(0, 8).toUpperCase();

export function tableBill(row) {
  const details = row.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const payment = details.payment || null;
  const cancelled = String(row.booking_status || "").toUpperCase() === "CANCELLED";
  const lines = lineList(row.order_items);
  return {
    id: `table-${row.id}`,
    kind: "table",
    status: cancelled ? "cancelled" : "paid",
    number: `T-${shortId(row.id)}`,
    table_no: row.table_no,
    guests: row.guest_count || null,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    amount: Number(row.total_amount || 0),
    subtotal: row.subtotal_amount == null ? null : Number(row.subtotal_amount),
    vat: row.tax_amount == null ? null : Number(row.tax_amount),
    method: String(payment?.method || row.payment_method || "ONLINE").toUpperCase(),
    reference: payment?.reference || row.payment_reference || null,
    promo_code: row.promo_code || null,
    discount: Number(row.discount_amount || 0),
    received: payment?.amount_received ?? null,
    change: payment?.change ?? null,
    at: (cancelled ? details.void?.at : payment?.at) || row.updated_at,
    opened_at: row.created_at || null,
    lines,
    items: countItems(lines),
    notes: row.notes || null,
    cancel_reason: cancelled ? details.void?.reason || null : null,
    staff_id: (cancelled ? details.void?.by : payment?.by) || null,
  };
}

export function tableBills(row) {
  const bill = tableBill(row);
  const split = row.order_details?.payment?.split;
  if (!Array.isArray(split) || bill.status === "cancelled") return [bill];
  return split.map((part, index) => ({
    ...bill,
    id: `${bill.id}-${index}`,
    method: part.method,
    amount: Number(part.amount || 0),
    split_total: bill.amount,
    split_part: index,
  }));
}

export function pickupBill(row) {
  const lines = lineList(row.items);
  return {
    id: `pickup-${row.id}`,
    kind: "pickup",
    status: String(row.order_status || "").toUpperCase() === "CANCELLED" ? "cancelled" : "paid",
    number: row.order_number || `P-${shortId(row.id)}`,
    pickup_code: row.pickup_code || null,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    amount: Number(row.total_amount || 0),
    subtotal: row.subtotal == null ? null : Number(row.subtotal),
    vat: row.tax_amount == null ? null : Number(row.tax_amount),
    discount: Number(row.discount_amount || 0),
    method: String(row.payment_method || "ONLINE").toUpperCase(),
    at: row.picked_up_at || row.updated_at,
    opened_at: row.created_at || null,
    lines,
    items: countItems(lines),
    notes: row.notes || null,
  };
}

export function bookingBill(row) {
  return {
    id: `booking-${row.id}`,
    kind: "booking",
    status: "paid",
    number: row.booking_code || `B-${shortId(row.id)}`,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    guests: row.party_size || null,
    amount: Number(row.payment_amount || 0),
    method: "ONLINE",
    reference: row.payment_reference || null,
    at: row.created_at,
    booked_for: `${row.booking_date} ${String(row.booking_time || "").slice(0, 5)}`.trim(),
    lines: [],
    items: 0,
  };
}

export function payBillBill(row) {
  return {
    id: `paybill-${row.id}`,
    kind: "pay_bill",
    status: "paid",
    number: row.tracking_id || `O-${shortId(row.id)}`,
    amount: Number(row.amount_major || 0),
    original: row.original_amount == null ? null : Number(row.original_amount),
    discount: Number(row.discount_amount || 0),
    discount_name: row.discount_name || null,
    cashback: Number(row.cashback_amount || 0),
    method: "ONLINE",
    reference: row.bank_reference || row.authorization_code || null,
    at: row.updated_at,
    lines: [],
    items: 0,
  };
}

export function billsInRange(bills, start, end) {
  return bills.filter((b) => new Date(b.at) >= new Date(start) && new Date(b.at) < new Date(end));
}

export function summarize(bills) {
  const today = bills.filter((b) => b.status !== "cancelled");
  const count = today.filter((b) => !b.split_part).length;
  const byMethod = {};
  let totalCents = 0;
  for (const bill of today) {
    const cents = Math.round(bill.amount * 100);
    totalCents += cents;
    byMethod[bill.method] = (byMethod[bill.method] || 0) + cents;
  }
  return {
    total: totalCents / 100,
    bills: count,
    average: count ? Math.round(totalCents / count) / 100 : 0,
    by_method: Object.entries(byMethod)
      .map(([method, cents]) => ({ method, amount: cents / 100 }))
      .sort((a, b) => b.amount - a.amount),
  };
}
