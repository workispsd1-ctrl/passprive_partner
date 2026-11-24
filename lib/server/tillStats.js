import { menuAreas, sectionPlace } from "../menuAreas.js";

const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;
export const VAT_RATE = 0.15;

const cents = (n) => Math.round(Number(n || 0) * 100);
const major = (c) => c / 100;
const netOf = (grossCents) => Math.round(grossCents / (1 + VAT_RATE));

export function vatSplit(grossCents, storedTaxCents) {
  if (storedTaxCents > 0) return { tax: storedTaxCents, included: false };
  return { tax: grossCents - netOf(grossCents), included: true };
}
const isStaff = (source) => ["cashier", "staff_pad", "staff", "staff_order", "bearer_platform"].includes(String(source || "").toLowerCase());
const details = (row) => (row.order_details && typeof row.order_details === "object" ? row.order_details : {});

export function isPaidTable(row) {
  const payment = String(row.payment_status || "").toUpperCase();
  return payment === "PAID" || payment === "COMPLETED" || String(row.booking_status || "").toUpperCase() === "PAID";
}

export function tableSale(row) {
  const payment = details(row).payment;
  const parts = Array.isArray(details(row).payments) ? details(row).payments : [];
  const deposit = Math.min(
    cents(row.total_amount),
    parts.filter((p) => String(p?.method || "").toUpperCase() === "DEPOSIT").reduce((n, p) => n + cents(p.amount), 0),
  );
  const amount = cents(row.total_amount) - deposit;
  const vat = vatSplit(amount, cents(row.tax_amount));
  return {
    at: payment?.at || row.updated_at,
    amount,
    tax: vat.tax,
    vatIncluded: vat.included,
    tip: cents(row.tip_amount ?? payment?.tip),
    tipMethod: String(payment?.tip_method || payment?.method || row.payment_method || "").toUpperCase(),
    tipSplit: Array.isArray(payment?.tip_split) ? payment.tip_split : null,
    method: String(payment?.method || row.payment_method || "ONLINE").toUpperCase(),
    split: Array.isArray(payment?.split) ? payment.split.filter((p) => String(p?.method || "").toUpperCase() !== "DEPOSIT") : null,
    deposit,
    channel: isStaff(row.source) ? "dine_in" : "qr",
    table: row.table_no ?? null,
    guests: Number(row.guest_count || 0),
    items: Array.isArray(row.order_items) ? row.order_items : [],
    ...tenderOf(row, payment, parts),
  };
}

function tenderOf(row, payment, parts) {
  const d = details(row);
  const seller = d.cashier_user_id || d.staff_user_id || d.last_append_by || payment?.by || null;
  const real = parts.filter((p) => String(p?.method || "").toUpperCase() !== "DEPOSIT");
  if (real.length) {
    return {
      seller,
      tenders: real.map((p) => ({
        method: String(p.method || "").toUpperCase(),
        cents: cents(p.amount),
        by: p.by || payment?.by || null,
        received: String(p.method || "").toUpperCase() === "CASH" ? cents(p.received ?? p.amount) : 0,
        change: String(p.method || "").toUpperCase() === "CASH" ? cents(p.change) : 0,
      })),
    };
  }
  const split = Array.isArray(payment?.split) ? payment.split.filter((p) => !["DEPOSIT", "PROMO"].includes(String(p?.method || "").toUpperCase())) : null;
  const by = payment?.by || null;
  const method = String(payment?.method || row.payment_method || "ONLINE").toUpperCase();
  const list = split?.length ? split.map((p) => ({ method: String(p.method).toUpperCase(), cents: cents(p.amount) })) : [{ method, cents: cents(payment?.amount_due ?? row.total_amount) }];
  const cashChange = cents(payment?.change);
  return {
    seller,
    tenders: list.map((t) => ({
      ...t,
      by,
      received: t.method === "CASH" ? t.cents + cashChange : 0,
      change: t.method === "CASH" ? cashChange : 0,
    })),
  };
}

export function pickupSale(row) {
  const amount = cents(row.total_amount);
  const vat = vatSplit(amount, cents(row.tax_amount));
  return {
    at: row.updated_at,
    amount,
    tax: vat.tax,
    vatIncluded: vat.included,
    method: String(row.payment_method || "ONLINE").toUpperCase(),
    channel: "pickup",
    guests: 0,
    items: Array.isArray(row.items) ? row.items : [],
    seller: row.metadata?.cashier_user_id || row.metadata?.payment?.by || null,
    tenders: [
      {
        method: String(row.payment_method || "ONLINE").toUpperCase(),
        cents: amount,
        by: row.metadata?.payment?.by || null,
        received: String(row.payment_method || "").toUpperCase() === "CASH" ? Math.max(amount, cents(row.metadata?.payment?.received)) : 0,
        change: String(row.payment_method || "").toUpperCase() === "CASH" ? Math.max(0, cents(row.metadata?.payment?.received) - amount) : 0,
      },
    ],
  };
}

export function bookingSale(row) {
  const amount = cents(row.payment_amount);
  return {
    at: row.created_at,
    amount,
    tax: vatSplit(amount, 0).tax,
    vatIncluded: true,
    method: String(row.payment_method || "ONLINE").toUpperCase(),
    channel: "booking",
    guests: 0,
    items: [],
  };
}

export function billPaymentSale(row) {
  const amount = cents(row.amount_major);
  return {
    at: row.updated_at,
    amount,
    tax: vatSplit(amount, 0).tax,
    vatIncluded: true,
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

export function statsMenu(menuJson) {
  const menu = typeof menuJson === "string" ? (() => { try { return JSON.parse(menuJson); } catch { return null; } })() : menuJson;
  const areas = menuAreas(menu);
  const items = new Map();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    const category = String(section?.name || "Other").trim() || "Other";
    const { kind } = sectionPlace(areas, section);
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      if (!item?.id) continue;
      items.set(String(item.id), { name: String(item.name || "Item"), category, kind, available: item.is_available !== false });
    }
  }
  return items;
}

export function tillStats(sales, voidRows = [], menu = null) {
  const methods = {};
  const channels = {};
  const hours = Array(24).fill(0);
  const days = {};
  const products = {};
  let total = 0;
  let tax = 0;
  let guests = 0;
  let tips = 0;
  let tipped = 0;
  let discounted = 0;
  let discountBills = 0;
  let offeredQty = 0;
  let offeredCents = 0;
  let cashReceived = 0;
  let cashChange = 0;
  const methodCounts = {};
  const payers = {};
  const sellers = {};
  const tipMethods = {};

  for (const sale of sales) {
    total += sale.amount;
    tax += sale.tax;
    guests += sale.guests;
    if (sale.tip > 0) {
      tips += sale.tip;
      tipped += 1;
      for (const part of sale.tipSplit || [{ method: sale.tipMethod || "OTHER", amount: sale.tip / 100 }]) {
        tipMethods[part.method] = (tipMethods[part.method] || 0) + cents(part.amount);
      }
    }
    for (const part of sale.split || [{ method: sale.method, amount: sale.amount / 100 }]) {
      methods[part.method] = (methods[part.method] || 0) + cents(part.amount);
    }
    channels[sale.channel] = (channels[sale.channel] || 0) + sale.amount;
    for (const t of sale.tenders || []) {
      methodCounts[t.method] = (methodCounts[t.method] || 0) + 1;
      cashReceived += t.received || 0;
      cashChange += t.change || 0;
      const who = t.by || "unknown";
      const entry = (payers[who] ||= { total: 0, methods: {} });
      entry.total += t.cents;
      entry.methods[t.method] = (entry.methods[t.method] || 0) + t.cents;
    }
    const seller = sale.seller || (sale.tenders || [])[0]?.by || "unknown";
    sellers[seller] = (sellers[seller] || 0) + sale.amount;
    const when = mauritiusDate(sale.at);
    hours[when.getUTCHours()] += sale.amount;
    const day = when.toISOString().slice(0, 10);
    days[day] = (days[day] || 0) + sale.amount;
    let saleDiscount = 0;
    for (const item of sale.items) {
      const list = cents(item?.list_price);
      const unit = cents(item?.unit_price);
      if (list > unit) saleDiscount += (list - unit) * Number(item?.qty || 0);
      if (list > 0 && unit === 0) {
        offeredQty += Number(item?.qty || 0);
        offeredCents += list * Number(item?.qty || 0);
      }
    }
    if (saleDiscount > 0) {
      discounted += saleDiscount;
      discountBills += 1;
    }
    for (const item of sale.items) {
      const key = String(item?.item_id || item?.name || "").trim();
      if (!key) continue;
      const known = menu?.get(String(item?.item_id || ""));
      const entry = (products[key] ||= {
        id: key,
        name: known?.name || String(item?.name || "Item"),
        category: known?.category || "Other",
        kind: known?.kind || (item?.station === "bar" ? "Bar" : "Kitchen"),
        qty: 0,
        cents: 0,
        net: 0,
      });
      const line = cents(item?.line_total);
      entry.qty += Number(item?.qty || 0);
      entry.cents += line;
      entry.net += sale.vatIncluded === false ? line : netOf(line);
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

  const productList = Object.values(products);
  const itemsCents = productList.reduce((sum, p) => sum + p.cents, 0);
  const pct = (value) => (itemsCents ? Math.round((value / itemsCents) * 1000) / 10 : 0);
  const categories = {};
  const kinds = {};
  for (const p of productList) {
    const c = (categories[`${p.kind}|${p.category}`] ||= { name: p.category, kind: p.kind, qty: 0, cents: 0, items: 0 });
    c.qty += p.qty;
    c.cents += p.cents;
    c.items += 1;
    kinds[p.kind] = (kinds[p.kind] || 0) + p.cents;
  }
  const soldIds = new Set(productList.map((p) => p.id));
  const notSold = menu
    ? [...menu.entries()]
        .filter(([id, m]) => m.available && !soldIds.has(id))
        .map(([, m]) => ({ name: m.name, category: m.category, kind: m.kind }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .slice(0, 300)
    : [];

  return {
    items: productList
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        kind: p.kind,
        qty: p.qty,
        amount: major(p.cents),
        excl_vat: major(p.net),
        share: pct(p.cents),
      }))
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty),
    categories: Object.values(categories)
      .map((c) => ({ name: c.name, kind: c.kind, qty: c.qty, items: c.items, amount: major(c.cents), share: pct(c.cents) }))
      .sort((a, b) => b.amount - a.amount),
    kinds: shares(kinds, itemsCents),
    not_sold: notSold,
    journal: {
      bills: sales.length,
      average: sales.length ? major(Math.round(total / sales.length)) : 0,
      total: major(total),
      excl_vat: major(total - tax),
      vat: major(tax),
      vat_rate: VAT_RATE * 100,
      tips: major(tips),
      tipped_bills: tipped,
      discounts: major(discounted),
      discounted_bills: discountBills,
      before_discounts: major(total + discounted),
      offered_qty: offeredQty,
      offered_value: major(offeredCents),
      collected: major(total + tips),
      guests,
      per_guest: guests ? major(Math.round(total / guests)) : 0,
    },
    methods: shares(methods, total),
    method_counts: methodCounts,
    cash: { received: major(cashReceived), change: major(cashChange), net: major(cashReceived - cashChange) },
    payers: Object.entries(payers).map(([id, v]) => ({ id, total: major(v.total), methods: Object.entries(v.methods).map(([key, c]) => ({ key, amount: major(c) })) })),
    sellers: Object.entries(sellers).map(([id, c]) => ({ id, total: major(c) })),
    tip_methods: shares(tipMethods, tips),
    channels: shares(channels, total),
    top_items: Object.values(products)
      .map((p) => ({ name: p.name, qty: p.qty, amount: major(p.cents), excl_vat: major(p.net), unit_price: p.qty ? major(Math.round(p.cents / p.qty)) : 0 }))
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
  const by = { confirmed: 0, pending: 0, cancelled: 0, no_show: 0, completed: 0 };
  const sources = {};
  let covers = 0;
  let deposits = 0;
  for (const row of rows) {
    const status = String(row.status || "pending").toLowerCase();
    const bucket = status.startsWith("payment_success") ? "confirmed" : status;
    if (by[bucket] != null) by[bucket] += 1;
    if (bucket !== "cancelled") covers += Number(row.party_size || 0);
    if (status.startsWith("payment_success") || String(row.payment_status || "") === "paid") deposits += cents(row.payment_amount ?? row.cover_charge_amount);
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

export async function loadSales(admin, restaurantId, start, end, tableNos = null) {
  const [tableRes, pickupRes, billRes, advanceRes] = await Promise.all([
    admin
      .from("restaurant_table_bookings")
      .select("table_no,total_amount,tax_amount,tip_amount,payment_method,payment_status,booking_status,source,guest_count,order_items,order_details,created_at,updated_at")
      .eq("restaurant_id", restaurantId)
      .gte("updated_at", start)
      .lt("updated_at", end)
      .order("updated_at", { ascending: false })
      .limit(5000),
    admin
      .from("restaurant_orders")
      .select("total_amount,tax_amount,payment_method,order_status,items,updated_at,metadata")
      .eq("restaurant_id", restaurantId)
      .or("payment_status.in.(PAID,COMPLETED),order_status.in.(PICKED_UP,COMPLETED)")
      .gte("updated_at", start)
      .lt("updated_at", end)
      .limit(5000),
    admin
      .from("payment_sessions")
      .select("amount_major,updated_at")
      .eq("restaurant_id", restaurantId)
      .eq("payment_context", "BILL_PAYMENT")
      .in("status", ["VERIFIED_SUCCESS", "FINALIZED"])
      .gte("updated_at", start)
      .lt("updated_at", end)
      .limit(5000),
    admin
      .from("restaurant_bookings")
      .select("payment_amount,payment_method,created_at")
      .eq("restaurant_id", restaurantId)
      .eq("payment_status", "paid")
      .gt("payment_amount", 0)
      .neq("status", "cancelled")
      .gte("created_at", start)
      .lt("created_at", end)
      .limit(5000),
  ]);
  for (const res of [tableRes, pickupRes, billRes, advanceRes]) if (res.error) throw res.error;

  const tables = (tableRes.data || []).filter((r) => !tableNos || tableNos.has(Number(r.table_no)));
  const scoped = Boolean(tableNos);
  const inPeriod = (sale) => new Date(sale.at) >= new Date(start) && new Date(sale.at) < new Date(end);
  const live = (status) => String(status || "").toUpperCase() !== "CANCELLED";
  return {
    tables,
    sales: [
      ...tables.filter((r) => isPaidTable(r) && live(r.booking_status)).map(tableSale).filter(inPeriod),
      ...(scoped ? [] : (pickupRes.data || []).filter((r) => live(r.order_status)).map(pickupSale)),
      ...(scoped ? [] : (billRes.data || []).map(billPaymentSale)),
      ...(scoped ? [] : (advanceRes.data || []).map(bookingSale)),
    ],
  };
}

const METHOD_NAMES = { CASH: "Cash", CARD: "Card", MAUCAS: "MauCas", JUICE: "Juice", CHEQUE: "Cheque", AVOIR: "Credit note", SPLIT: "Split", ONLINE: "Online (app)", ACCOUNT: "On account (unpaid)", BANK: "Bank transfer", OFFERED: "Offered" };

export function accountPayments(rows) {
  const by = {};
  let total = 0;
  for (const r of rows) {
    const c = cents(r.amount);
    total += c;
    by[r.method] = (by[r.method] || 0) + c;
  }
  return { total: major(total), count: rows.length, methods: shares(by, total) };
}
const CHANNEL_NAMES = { dine_in: "Dine-in", qr: "QR orders", pickup: "Pickup", pay_bill: "Pay Bill", booking: "Table Bookings" };
const REPORT_FR = {
  SALES: "VENTES",
  "Items sold": "Articles vendus",
  Bills: "Tickets",
  "Total paid on bills": "Total TTC encaissé",
  "- Tips": "- Pourboires",
  "- VAT {rate}%": "- TVA {rate}%",
  "= Amount excl. tips & VAT": "= Montant HT hors pourboires",
  DETAILS: "DÉTAILS",
  "Sales incl. VAT (no tips)": "Ventes TTC (hors pourboires)",
  "Discounts given ({n} bills)": "Remises accordées ({n} tickets)",
  "Sales before discounts": "Ventes avant remises",
  "Bills with a tip": "Tickets avec pourboire",
  Guests: "Couverts",
  "Average bill": "Ticket moyen",
  "Spend per guest": "Moyenne par couvert",
  "COMPARED WITH": "COMPARAISON",
  "{from} to {to}": "Du {from} au {to}",
  Change: "Évolution",
  "PAYMENT METHODS": "MODES DE RÈGLEMENT",
  "ACCOUNT PAYMENTS RECEIVED": "RÈGLEMENTS DE COMPTES CLIENTS",
  "Total ({n})": "Total ({n})",
  "TIPS BY METHOD": "POURBOIRES PAR MODE",
  "SALES CHANNELS": "MODES DE VENTE",
  CATEGORIES: "RUBRIQUES",
  "BEST SELLERS": "MEILLEURES VENTES",
  "excl. VAT": "HT",
  VAT: "TVA",
  "Sales excl. {rate}% VAT": "Ventes HT ({rate}% TVA)",
  "+ VAT {rate}%": "+ TVA {rate}%",
  "= Total sales": "= Total TTC",
  "EVERY BILL ({n})": "TOUS LES TICKETS ({n})",
  OFFERED: "OFFERTS",
  Quantity: "Quantité",
  "Total value": "Valeur totale",
  CANCELLATIONS: "ANNULATIONS",
  "Cancelled tables": "Notes supprimées",
  "Items removed": "Suppressions d'articles",
  "SALES REPORT": "CLÔTURE DE PÉRIODE",
  "SALES REPORT · BILLS": "CLÔTURE · TICKETS",
  "SALES REPORT · ITEMS": "CLÔTURE · ARTICLES",
  Cash: "Espèces",
  Card: "Carte bancaire",
  Cheque: "Chèque",
  "Credit note": "Avoir",
  Split: "Partagé",
  "Online (app)": "En ligne (app)",
  "On account (unpaid)": "Sur compte (impayé)",
  "Bank transfer": "Virement",
  "Dine-in": "Sur place",
  "QR orders": "Commandes QR",
  Pickup: "À emporter",
  "Pay Bill": "Paiement app",
  "Table Bookings": "Réservations",
};

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const row = (label, value, bold = false) => ({ label, value, ...(bold ? { bold: true } : {}) });

export function previousPeriod(from, to) {
  const day = 86400000;
  const start = Date.parse(`${from}T12:00:00Z`);
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - start) / day) + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - days * day), to: iso(start - day), days };
}

export function compareTotals(current, previous) {
  const change = previous.total ? Math.round(((current.total - previous.total) / previous.total) * 1000) / 10 : null;
  return { ...previous, change_pct: change };
}

const clock = (at) => new Date(new Date(at).getTime() + MAURITIUS_OFFSET_MS).toISOString().slice(11, 16);

export function statsReport(stats, { period, area, withItems, sales = null, lang = "en" }) {
  const t = (key, vars = {}) => {
    const base = lang === "fr" ? REPORT_FR[key] || key : key;
    return Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), base);
  };
  const method = (key) => t(METHOD_NAMES[key] || key);
  const channel = (key) => t(CHANNEL_NAMES[key] || key);
  const j = stats.journal;
  const itemsSold = stats.items.reduce((n, i) => n + Number(i.qty || 0), 0);
  const sections = [
    {
      title: t("SALES"),
      rows: [
        row(t("Items sold"), String(itemsSold)),
        row(t("Bills"), String(j.bills)),
        row(t("Total paid on bills"), fmt(j.collected), true),
        row(t("- Tips"), fmt(j.tips)),
        row(t("- VAT {rate}%", { rate: j.vat_rate }), fmt(j.vat)),
        row(t("= Amount excl. tips & VAT"), fmt(j.excl_vat), true),
      ],
    },
    {
      title: t("DETAILS"),
      rows: [
        row(t("Sales incl. VAT (no tips)"), fmt(j.total)),
        ...(j.discounts > 0 ? [row(t("Discounts given ({n} bills)", { n: j.discounted_bills }), fmt(j.discounts)), row(t("Sales before discounts"), fmt(j.before_discounts))] : []),
        row(t("Bills with a tip"), String(j.tipped_bills)),
        row(t("Guests"), String(j.guests)),
        row(t("Average bill"), fmt(j.average)),
        row(t("Spend per guest"), fmt(j.per_guest)),
      ],
    },
  ];
  if (stats.compare) {
    const c = stats.compare;
    sections.push({
      title: t("COMPARED WITH"),
      rows: [
        row(t("{from} to {to}", { from: c.from, to: c.to }), fmt(c.total)),
        row(t("Change"), c.change_pct == null ? "-" : `${c.change_pct > 0 ? "+" : ""}${c.change_pct}%`, true),
      ],
    });
  }
  sections.push({ title: t("PAYMENT METHODS"), rows: stats.methods.map((m) => row(method(m.key), fmt(m.amount))) });
  if (stats.account_payments?.count) {
    sections.push({
      title: t("ACCOUNT PAYMENTS RECEIVED"),
      rows: [
        ...stats.account_payments.methods.map((m) => row(method(m.key), fmt(m.amount))),
        row(t("Total ({n})", { n: stats.account_payments.count }), fmt(stats.account_payments.total), true),
      ],
    });
  }
  if ((stats.tip_methods || []).length) sections.push({ title: t("TIPS BY METHOD"), rows: stats.tip_methods.map((m) => row(method(m.key), fmt(m.amount))) });
  sections.push({ title: t("SALES CHANNELS"), rows: stats.channels.map((c) => row(channel(c.key), fmt(c.amount))) });
  if (stats.categories.length) {
    sections.push({ title: t("CATEGORIES"), rows: stats.categories.map((c) => row(`${c.name} (${c.qty})`, fmt(c.amount))) });
  }
  const best = [...stats.items].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 10);
  if (best.length) sections.push({ title: t("BEST SELLERS"), rows: best.map((i, n) => row(`${n + 1}. ${i.qty} x ${i.name}`, fmt(i.amount))) });
  if (withItems && stats.items.length) {
    const byCategory = new Map();
    for (const item of stats.items) {
      const list = byCategory.get(item.category) || [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    for (const [category, list] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({
        title: category.toUpperCase(),
        rows: list.sort((a, b) => b.qty - a.qty).map((i) => row(`${i.qty} x ${i.name}`, fmt(i.amount))),
      });
    }
  }
  if (Array.isArray(sales) && sales.length) {
    const list = [...sales].sort((a, b) => new Date(a.at) - new Date(b.at));
    const rows = [];
    for (const sale of list) {
      const where = sale.table ? `T${sale.table}` : channel(sale.channel);
      rows.push(row(`${clock(sale.at)} ${where} ${method(sale.method)}`, fmt(sale.amount / 100), true));
      rows.push(row(`  ${t("excl. VAT")} ${fmt((sale.amount - sale.tax) / 100)}`, `${t("VAT")} ${fmt(sale.tax / 100)}`));
    }
    rows.push(row(t("Sales excl. {rate}% VAT", { rate: j.vat_rate }), fmt(j.excl_vat)), row(t("+ VAT {rate}%", { rate: j.vat_rate }), fmt(j.vat)), row(t("= Total sales"), fmt(j.total), true));
    sections.push({ title: t("EVERY BILL ({n})", { n: list.length }), rows });
  }
  sections.push({
    title: t("OFFERED"),
    rows: [row(t("Quantity"), String(j.offered_qty || 0)), row(t("Total value"), fmt(j.offered_value || 0), true)],
  });
  sections.push({
    title: t("CANCELLATIONS"),
    rows: [
      row(t("Cancelled tables"), `${stats.losses.cancelled} · ${fmt(stats.losses.cancelled_amount)}`),
      row(t("Items removed"), `${stats.losses.voided_items} · ${fmt(stats.losses.voided_amount)}`),
    ],
  });
  const title = t(Array.isArray(sales) ? "SALES REPORT · BILLS" : withItems ? "SALES REPORT · ITEMS" : "SALES REPORT");
  return { title, period, area: area || null, sections };
}
