const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function mauritiusDayRange(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const start = new Date(`${date}T00:00:00+04:00`);
  if (Number.isNaN(start.getTime())) return null;
  if (new Date(start.getTime() + MAURITIUS_OFFSET_MS).toISOString().slice(0, 10) !== date) return null;
  return { start: start.toISOString(), end: new Date(start.getTime() + DAY_MS).toISOString() };
}

export function toBill(row) {
  const payment = row.order_details && typeof row.order_details === "object" ? row.order_details.payment : null;
  return {
    id: row.id,
    table_no: row.table_no,
    amount: Number(row.total_amount || 0),
    method: String(payment?.method || row.payment_method || "ONLINE").toUpperCase(),
    reference: payment?.reference || row.payment_reference || null,
    at: payment?.at || row.updated_at,
    items: Array.isArray(row.order_items) ? row.order_items.reduce((n, i) => n + Number(i?.qty || 0), 0) : 0,
    guests: row.guest_count || null,
    customer_name: row.customer_name || null,
  };
}

export function billsInRange(bills, start, end) {
  return bills.filter((b) => new Date(b.at) >= new Date(start) && new Date(b.at) < new Date(end));
}

export function summarize(today) {
  const byMethod = {};
  let totalCents = 0;
  for (const bill of today) {
    const cents = Math.round(bill.amount * 100);
    totalCents += cents;
    byMethod[bill.method] = (byMethod[bill.method] || 0) + cents;
  }
  return {
    total: totalCents / 100,
    bills: today.length,
    average: today.length ? Math.round(totalCents / today.length) / 100 : 0,
    by_method: Object.entries(byMethod)
      .map(([method, cents]) => ({ method, amount: cents / 100 }))
      .sort((a, b) => b.amount - a.amount),
  };
}
