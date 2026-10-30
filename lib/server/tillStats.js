const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;

const cents = (n) => Math.round(Number(n || 0) * 100);
const major = (c) => c / 100;
const isStaff = (source) => ["cashier", "staff_pad", "staff", "staff_order", "bearer_platform"].includes(String(source || "").toLowerCase());
const details = (row) => (row.order_details && typeof row.order_details === "object" ? row.order_details : {});

export function isPaidTable(row) {
  const payment = String(row.payment_status || "").toUpperCase();
  return payment === "PAID" || payment === "COMPLETED" || String(row.booking_status || "").toUpperCase() === "PAID";
}

export function tableSale(row) {
  const payment = details(row).payment;
  return {
    at: payment?.at || row.updated_at,
    amount: cents(row.total_amount),
    tax: cents(row.tax_amount),
    method: String(payment?.method || row.payment_method || "ONLINE").toUpperCase(),
    channel: isStaff(row.source) ? "dine_in" : "qr",
    guests: Number(row.guest_count || 0),
    items: Array.isArray(row.order_items) ? row.order_items : [],
  };
}

export function pickupSale(row) {
  return {
    at: row.updated_at,
    amount: cents(row.total_amount),
    tax: cents(row.tax_amount),
    method: String(row.payment_method || "ONLINE").toUpperCase(),
    channel: "pickup",
    guests: 0,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export function bookingSale(row) {
  return {
    at: row.created_at,
    amount: cents(row.payment_amount),
    tax: 0,
    method: "ONLINE",
    channel: "booking",
    guests: 0,
    items: [],
  };
}

export function billPaymentSale(row) {
  return {
    at: row.updated_at,
    amount: cents(row.amount_major),
    tax: 0,
    method: "ONLINE",
    channel: "pay_bill",
    guests: 0,
    items: [],
  };
}

function shares(totals, grand) {
  return Object.entries(totals)
    .map(([key, value]) => ({ key, amount: major(value), share: grand ? Math.round((value / grand) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function mauritiusDate(at) {
  return new Date(new Date(at).getTime() + MAURITIUS_OFFSET_MS);
}

export function tillStats(sales, voidRows = []) {
  const methods = {};
  const channels = {};
  const hours = Array(24).fill(0);
  const days = {};
  const products = {};
  let total = 0;
  let tax = 0;
  let guests = 0;

  for (const sale of sales) {
    total += sale.amount;
    tax += sale.tax;
    guests += sale.guests;
    methods[sale.method] = (methods[sale.method] || 0) + sale.amount;
    channels[sale.channel] = (channels[sale.channel] || 0) + sale.amount;
    const when = mauritiusDate(sale.at);
    hours[when.getUTCHours()] += sale.amount;
    const day = when.toISOString().slice(0, 10);
    days[day] = (days[day] || 0) + sale.amount;
    for (const item of sale.items) {
      const key = String(item?.item_id || item?.name || "").trim();
      if (!key) continue;
      const entry = (products[key] ||= { name: String(item?.name || "Item"), qty: 0, cents: 0 });
      entry.qty += Number(item?.qty || 0);
      entry.cents += cents(item?.line_total);
    }
  }

  let cancelled = 0;
  let cancelledCents = 0;
  let voidCount = 0;
  let voidCents = 0;
  for (const row of voidRows) {
    if (row.cancelled) {
      cancelled += 1;
      cancelledCents += row.cancelled;
    }
    voidCount += row.voidQty;
    voidCents += row.voidCents;
  }

  return {
    journal: {
      bills: sales.length,
      average: sales.length ? major(Math.round(total / sales.length)) : 0,
      total: major(total),
      excl_vat: major(total - tax),
      vat: major(tax),
      guests,
      per_guest: guests ? major(Math.round(total / guests)) : 0,
    },
    methods: shares(methods, total),
    channels: shares(channels, total),
    top_items: Object.values(products)
      .map((p) => ({ name: p.name, qty: p.qty, amount: major(p.cents) }))
      .sort((a, b) => b.qty - a.qty || b.amount - a.amount)
      .slice(0, 50),
    hours: hours.map((value, hour) => ({ hour, amount: major(value) })).filter((h) => h.amount > 0),
    days: Object.keys(days).sort().map((day) => ({ day, amount: major(days[day]) })),
    losses: {
      cancelled,
      cancelled_amount: major(cancelledCents),
      voided_items: voidCount,
      voided_amount: major(voidCents),
    },
  };
}

export function voidSummary(row, start, end) {
  const d = details(row);
  const inRange = (at) => at && new Date(at) >= new Date(start) && new Date(at) < new Date(end);
  let voidQty = 0;
  let voidCents = 0;
  for (const v of Array.isArray(d.voids) ? d.voids : []) {
    if (!inRange(v.at)) continue;
    const qty = Math.max(0, Number(v.from_qty || 0) - Number(v.to_qty || 0));
    voidQty += qty;
    voidCents += cents(v.unit_price) * qty;
  }
  const isCancelled = String(row.booking_status || "").toUpperCase() === "CANCELLED" && inRange(d.void?.at || row.updated_at);
  return { voidQty, voidCents, cancelled: isCancelled ? Math.max(1, cents(d.void?.total_amount ?? row.total_amount)) : 0 };
}

const minutesBetween = (from, to) => (new Date(to) - new Date(from)) / 60000;
const average = (values) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

export function bookingStats(rows) {
  const by = { confirmed: 0, pending: 0, cancelled: 0, no_show: 0 };
  const sources = {};
  let covers = 0;
  let deposits = 0;
  for (const row of rows) {
    const status = String(row.status || "pending").toLowerCase();
    const bucket = status.startsWith("payment_success") ? "confirmed" : status;
    if (by[bucket] != null) by[bucket] += 1;
    if (bucket !== "cancelled") covers += Number(row.party_size || 0);
    if (status.startsWith("payment_success")) deposits += cents(row.payment_amount ?? row.cover_charge_amount);
    const source = String(row.source || "app").toLowerCase();
    sources[source] = (sources[source] || 0) + 1;
  }
  const seated = rows.length - by.cancelled;
  return {
    total: rows.length,
    ...by,
    covers,
    average_party: seated ? Math.round((covers / seated) * 10) / 10 : 0,
    no_show_rate: rows.length ? Math.round((by.no_show / rows.length) * 1000) / 10 : 0,
    deposits: major(deposits),
    sources: Object.entries(sources)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function pickupStats(rows) {
  const cancelled = rows.filter((r) => String(r.order_status || "").toUpperCase() === "CANCELLED");
  const live = rows.filter((r) => String(r.order_status || "").toUpperCase() !== "CANCELLED");
  const value = live.reduce((sum, r) => sum + cents(r.total_amount), 0);
  const done = (r) => ["PICKED_UP", "COMPLETED"].includes(String(r.order_status || "").toUpperCase());
  return {
    orders: live.length,
    collected: live.filter(done).length,
    cancelled: cancelled.length,
    value: major(value),
    average: live.length ? major(Math.round(value / live.length)) : 0,
    prep_minutes: average(live.filter((r) => r.accepted_at && r.ready_at).map((r) => minutesBetween(r.accepted_at, r.ready_at))),
    wait_minutes: average(live.filter((r) => r.ready_at && r.picked_up_at).map((r) => minutesBetween(r.ready_at, r.picked_up_at))),
  };
}

export function serviceStats(tableRows, hours) {
  const stays = tableRows
    .map((r) => {
      const paidAt = details(r).payment?.at;
      return paidAt && r.created_at ? minutesBetween(r.created_at, paidAt) : null;
    })
    .filter((m) => m !== null && m >= 0 && m < 12 * 60);
  const busiest = hours.reduce((best, h) => (!best || h.amount > best.amount ? h : best), null);
  return { table_minutes: average(stays), tables_timed: stays.length, busiest_hour: busiest?.hour ?? null };
}
