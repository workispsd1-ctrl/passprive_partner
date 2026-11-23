import { queueReceiptJob } from "@/lib/server/printJobs";

export const SETTLE_METHODS = ["CASH", "CARD", "MAUCAS", "JUICE", "CHEQUE", "BANK", "AVOIR"];
const NEEDS_REFERENCE = ["CHEQUE", "AVOIR"];
const ACCOUNT_FIELDS = "id, name, phone, credit_limit, notes, active, created_at";
const BILL_FIELDS = "id, table_no, customer_name, total_amount, order_details, updated_at, account_id, payment_status";
const PICKUP_FIELDS = "id, order_number, customer_name, total_amount, metadata, updated_at, account_id, payment_status, payment_method, order_status";

export function pickupAsBill(o) {
  const paid = up(o.payment_method) === "ACCOUNT";
  return {
    id: o.id,
    kind: "takeaway",
    number: o.order_number || null,
    table_no: null,
    customer_name: o.customer_name,
    account_id: o.account_id,
    updated_at: o.updated_at,
    order_details: { payment: { method: paid ? "ACCOUNT" : up(o.payment_method), amount_due: Number(o.total_amount || 0), at: o.metadata?.payment?.at || o.updated_at } },
  };
}

function pickupQuery(admin, restaurantId) {
  return admin
    .from("restaurant_orders")
    .select(PICKUP_FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("payment_status", "PAID")
    .neq("order_status", "CANCELLED");
}

const fail = (status, error) => ({ status, body: { ok: false, error } });
const cents = (n) => Math.round(Number(n || 0) * 100);
const up = (v) => String(v || "").trim().toUpperCase();
const clean = (v, max) => String(v || "").trim().slice(0, max);

export function accountCents(row) {
  const d = row?.order_details && typeof row.order_details === "object" ? row.order_details : {};
  const parts = Array.isArray(d.payments) ? d.payments : [];
  if (parts.length) return parts.filter((p) => up(p.method) === "ACCOUNT").reduce((n, p) => n + cents(p.amount), 0);
  const pay = d.payment;
  if (!pay) return 0;
  if (Array.isArray(pay.split)) return pay.split.filter((p) => up(p.method) === "ACCOUNT").reduce((n, p) => n + cents(p.amount), 0);
  return up(pay.method) === "ACCOUNT" ? cents(pay.amount_due) : 0;
}

export function ledger(bills, payments) {
  const settled = new Map();
  let paidCents = 0;
  for (const p of payments) {
    paidCents += cents(p.amount);
    for (const a of Array.isArray(p.allocations) ? p.allocations : []) settled.set(a.order_id, (settled.get(a.order_id) || 0) + cents(a.amount));
  }
  const rows = bills
    .map((b) => {
      const owed = accountCents(b);
      const done = Math.min(owed, settled.get(b.id) || 0);
      const at = b.order_details?.payment?.at || b.updated_at;
      return { order_id: b.id, kind: b.kind || "table", number: b.number || null, table_no: b.table_no, customer_name: b.customer_name, at, owed, settled: done, open: owed - done };
    })
    .filter((r) => r.owed > 0)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const owedCents = rows.reduce((n, r) => n + r.owed, 0);
  return { bills: rows, owedCents, paidCents, balanceCents: Math.max(0, owedCents - paidCents) };
}

export function allocate(openBills, amountCents, preferred = []) {
  const order = [
    ...openBills.filter((b) => preferred.includes(b.order_id)),
    ...openBills.filter((b) => !preferred.includes(b.order_id)),
  ];
  let left = amountCents;
  const out = [];
  for (const b of order) {
    if (left <= 0) break;
    if (b.open <= 0) continue;
    const take = Math.min(b.open, left);
    out.push({ order_id: b.order_id, amount: take / 100 });
    left -= take;
  }
  return { allocations: out, unallocatedCents: left };
}

async function loadLedger(admin, restaurantId, accountId) {
  const [billsRes, pickupRes, paysRes] = await Promise.all([
    admin
      .from("restaurant_table_bookings")
      .select(BILL_FIELDS)
      .eq("restaurant_id", restaurantId)
      .eq("account_id", accountId)
      .in("payment_status", ["PAID", "COMPLETED"])
      .order("updated_at", { ascending: true })
      .limit(2000),
    pickupQuery(admin, restaurantId).eq("account_id", accountId).limit(2000),
    admin
      .from("customer_account_payments")
      .select("id, amount, method, reference, allocations, created_at, created_by, note")
      .eq("restaurant_id", restaurantId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);
  if (billsRes.error) throw billsRes.error;
  if (pickupRes.error) throw pickupRes.error;
  if (paysRes.error) throw paysRes.error;
  const all = [...(billsRes.data || []), ...(pickupRes.data || []).map(pickupAsBill)];
  return { ...ledger(all, paysRes.data || []), payments: paysRes.data || [] };
}

async function loadAccount(admin, restaurantId, accountId) {
  const { data, error } = await admin.from("customer_accounts").select(ACCOUNT_FIELDS).eq("id", accountId).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function checkCharge(admin, restaurantId, accountId, amountCents) {
  const id = String(accountId || "").trim();
  if (!id) return { error: "Pick the customer who pays later." };
  const account = await loadAccount(admin, restaurantId, id);
  if (!account || !account.active) return { error: "This customer account is not active." };
  if (account.credit_limit != null) {
    const { balanceCents } = await loadLedger(admin, restaurantId, id);
    if (balanceCents + amountCents > cents(account.credit_limit)) {
      return { error: `This would take ${account.name} over their limit of MUR ${Number(account.credit_limit).toFixed(2)}. They owe MUR ${(balanceCents / 100).toFixed(2)}.` };
    }
  }
  return { account };
}

export async function listAccounts(admin, restaurantId, { q = "", all = false } = {}) {
  let query = admin.from("customer_accounts").select(ACCOUNT_FIELDS).eq("restaurant_id", restaurantId).order("name", { ascending: true }).limit(500);
  if (!all) query = query.eq("active", true);
  const term = clean(q, 40).replace(/[%,()]/g, "");
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: accounts, error } = await query;
  if (error) throw error;
  const ids = (accounts || []).map((a) => a.id);
  if (!ids.length) return { status: 200, body: { ok: true, accounts: [] } };
  const [billsRes, pickupRes, paysRes] = await Promise.all([
    admin.from("restaurant_table_bookings").select(BILL_FIELDS).eq("restaurant_id", restaurantId).in("account_id", ids).in("payment_status", ["PAID", "COMPLETED"]).limit(5000),
    pickupQuery(admin, restaurantId).in("account_id", ids).limit(5000),
    admin.from("customer_account_payments").select("account_id, amount, allocations").eq("restaurant_id", restaurantId).in("account_id", ids).limit(5000),
  ]);
  if (billsRes.error) throw billsRes.error;
  if (pickupRes.error) throw pickupRes.error;
  if (paysRes.error) throw paysRes.error;
  const every = [...(billsRes.data || []), ...(pickupRes.data || []).map(pickupAsBill)];
  const out = (accounts || []).map((a) => {
    const l = ledger(
      every.filter((b) => b.account_id === a.id),
      (paysRes.data || []).filter((p) => p.account_id === a.id),
    );
    return { ...a, balance: l.balanceCents / 100, open_bills: l.bills.filter((b) => b.open > 0).length };
  });
  return { status: 200, body: { ok: true, accounts: out } };
}

export async function createAccount(admin, restaurantId, userId, body) {
  const name = clean(body?.name, 80);
  const phone = clean(body?.phone, 20).replace(/[^\d+ ]/g, "");
  if (!name) return fail(400, "Enter the customer's name.");
  if (phone && !/^\+?[\d ]{7,18}$/.test(phone)) return fail(400, "Enter a valid phone number.");
  const limit = body?.credit_limit === "" || body?.credit_limit == null ? null : Number(body.credit_limit);
  if (limit != null && (!Number.isFinite(limit) || limit < 0 || limit > 10_000_000)) return fail(400, "Enter a valid limit.");
  const { data: same } = await admin
    .from("customer_accounts")
    .select(ACCOUNT_FIELDS)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .ilike("name", name)
    .limit(5);
  const twin = (same || []).find((a) => (a.phone || "") === phone);
  if (twin) return { status: 200, body: { ok: true, account: { ...twin, balance: 0 }, existing: true } };
  const { data, error } = await admin
    .from("customer_accounts")
    .insert({ restaurant_id: restaurantId, name, phone: phone || null, credit_limit: limit, notes: clean(body?.notes, 200) || null, created_by: userId })
    .select(ACCOUNT_FIELDS)
    .single();
  if (error) return fail(400, error.message);
  return { status: 200, body: { ok: true, account: { ...data, balance: 0 } } };
}

export async function updateAccount(admin, restaurantId, body) {
  const id = String(body?.id || "").trim();
  const account = id ? await loadAccount(admin, restaurantId, id) : null;
  if (!account) return fail(404, "Customer account not found.");
  const patch = {};
  if (body?.name !== undefined) {
    const name = clean(body.name, 80);
    if (!name) return fail(400, "Enter the customer's name.");
    patch.name = name;
  }
  if (body?.phone !== undefined) patch.phone = clean(body.phone, 20).replace(/[^\d+ ]/g, "") || null;
  if (body?.credit_limit !== undefined) {
    const limit = body.credit_limit === "" || body.credit_limit == null ? null : Number(body.credit_limit);
    if (limit != null && (!Number.isFinite(limit) || limit < 0)) return fail(400, "Enter a valid limit.");
    patch.credit_limit = limit;
  }
  if (body?.active === false) {
    const { balanceCents } = await loadLedger(admin, restaurantId, id);
    if (balanceCents > 0) return fail(409, `${account.name} still owes MUR ${(balanceCents / 100).toFixed(2)}. Settle it before closing the account.`);
    patch.active = false;
  }
  if (!Object.keys(patch).length) return fail(400, "Nothing to change.");
  const { data, error } = await admin
    .from("customer_accounts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select(ACCOUNT_FIELDS)
    .single();
  if (error) return fail(400, error.message);
  return { status: 200, body: { ok: true, account: data } };
}

export async function accountDetail(admin, restaurantId, accountId) {
  const account = await loadAccount(admin, restaurantId, String(accountId || ""));
  if (!account) return fail(404, "Customer account not found.");
  const l = await loadLedger(admin, restaurantId, account.id);
  return {
    status: 200,
    body: {
      ok: true,
      account: { ...account, balance: l.balanceCents / 100 },
      bills: l.bills.map((b) => ({ ...b, owed: b.owed / 100, settled: b.settled / 100, open: b.open / 100 })),
      payments: l.payments,
    },
  };
}

export async function settleAccount(admin, restaurantId, userId, body, { terminalId = null, allowed = SETTLE_METHODS } = {}) {
  const accountId = String(body?.account_id || "").trim();
  const method = up(body?.method);
  const key = clean(body?.idempotency_key, 64);
  const reference = clean(body?.reference, 60);
  if (!accountId || !key) return fail(400, "account_id and idempotency_key are required");
  if (!allowed.includes(method)) return fail(400, "Pick how the customer pays.");
  if (NEEDS_REFERENCE.includes(method) && !reference) return fail(400, "Enter the reference number.");

  const { data: done } = await admin
    .from("customer_account_payments")
    .select("id, amount, method, allocations, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (done) return { status: 200, body: { ok: true, payment: done, repeated: true } };

  const account = await loadAccount(admin, restaurantId, accountId);
  if (!account) return fail(404, "Customer account not found.");
  const l = await loadLedger(admin, restaurantId, accountId);
  const amountCents = cents(body?.amount);
  if (!Number.isInteger(amountCents) || amountCents < 1) return fail(400, "Enter the amount the customer pays.");
  if (amountCents > l.balanceCents) return fail(400, `${account.name} owes MUR ${(l.balanceCents / 100).toFixed(2)}. Enter that amount or less.`);
  if (body?.paid_cents !== undefined && Number(body.paid_cents) !== amountCents) return fail(409, "amount_mismatch");
  const preferred = Array.isArray(body?.order_ids) ? body.order_ids.map(String) : [];
  const { allocations } = allocate(l.bills.filter((b) => b.open > 0), amountCents, preferred);
  const gateway = body?.gateway && typeof body.gateway === "object"
    ? {
        merchant_ref: clean(body.gateway.merchant_ref, 64) || null,
        auth_code: clean(body.gateway.auth_code, 20) || null,
        rrn: clean(body.gateway.rrn, 32) || null,
        card_type: clean(body.gateway.card_type, 30) || null,
        last4: clean(body.gateway.last4, 4) || null,
        terminal_id: terminalId,
      }
    : null;

  const { data: saved, error } = await admin
    .from("customer_account_payments")
    .insert({
      restaurant_id: restaurantId,
      account_id: accountId,
      amount: amountCents / 100,
      method,
      reference: reference || gateway?.rrn || gateway?.auth_code || null,
      gateway,
      allocations,
      idempotency_key: key,
      note: clean(body?.note, 120) || null,
      terminal_id: terminalId,
      created_by: userId,
    })
    .select("id, amount, method, reference, allocations, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: again } = await admin.from("customer_account_payments").select("id, amount, method, allocations, created_at").eq("restaurant_id", restaurantId).eq("idempotency_key", key).maybeSingle();
      if (again) return { status: 200, body: { ok: true, payment: again, repeated: true } };
    }
    return fail(400, error.message);
  }
  const balance = (l.balanceCents - amountCents) / 100;
  if (body?.print !== false) {
    await printSettlement(admin, restaurantId, account, saved, l.bills, balance).catch((e) => console.error("account receipt print failed", e?.message));
  }
  return { status: 200, body: { ok: true, payment: saved, balance } };
}

const METHOD_NAMES = { CASH: "Cash", CARD: "Card", MAUCAS: "MauCas", JUICE: "Juice", CHEQUE: "Cheque", BANK: "Bank transfer", AVOIR: "Credit note" };
const fmt = (v) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (at) => new Date(at).toLocaleDateString("en-GB", { timeZone: "Indian/Mauritius", day: "2-digit", month: "short" });

async function printSettlement(admin, restaurantId, account, payment, bills, balance) {
  const byId = new Map(bills.map((b) => [b.order_id, b]));
  const rows = (payment.allocations || []).map((a) => {
    const b = byId.get(a.order_id);
    return { label: `${b ? day(b.at) : ""}${b?.table_no ? ` · T${b.table_no}` : b?.kind === "takeaway" ? " · Takeaway" : ""}`.trim() || "Bill", value: fmt(a.amount) };
  });
  await queueReceiptJob(admin, restaurantId, {
    kind: "report",
    source: "Customer account",
    payload: {
      title: "ACCOUNT PAYMENT",
      period: account.name,
      sections: [
        { title: "BILLS PAID", rows },
        {
          title: "PAYMENT",
          rows: [
            { label: METHOD_NAMES[payment.method] || payment.method, value: fmt(payment.amount), bold: true },
            ...(payment.reference ? [{ label: "Reference", value: String(payment.reference) }] : []),
            { label: "Still owed", value: fmt(balance), bold: true },
          ],
        },
      ],
    },
  });
}

export async function printStatement(admin, restaurantId, accountId) {
  const account = await loadAccount(admin, restaurantId, String(accountId || ""));
  if (!account) return fail(404, "Customer account not found.");
  const l = await loadLedger(admin, restaurantId, account.id);
  const open = l.bills.filter((b) => b.open > 0);
  const label = (b) => `${day(b.at)}${b.table_no ? ` · T${b.table_no}` : b.kind === "takeaway" ? " · Takeaway" : ""}`;
  const recent = l.payments.slice(-5).reverse();
  await queueReceiptJob(admin, restaurantId, {
    kind: "report",
    source: "Customer account",
    payload: {
      title: "ACCOUNT STATEMENT",
      period: [account.name, account.phone].filter(Boolean).join(" · "),
      sections: [
        {
          title: `UNPAID BILLS (${open.length})`,
          rows: open.length
            ? open.map((b) => ({ label: b.settled > 0 ? `${label(b)} (part paid)` : label(b), value: fmt(b.open / 100) }))
            : [{ label: "Nothing owed", value: "" }],
        },
        ...(recent.length
          ? [{ title: "LAST PAYMENTS", rows: recent.map((p) => ({ label: `${day(p.created_at)} · ${METHOD_NAMES[p.method] || p.method}`, value: fmt(p.amount) })) }]
          : []),
        {
          title: "TOTAL",
          rows: [
            ...(account.credit_limit != null ? [{ label: "Credit limit", value: fmt(account.credit_limit) }] : []),
            { label: "Total owed", value: fmt(l.balanceCents / 100), bold: true },
          ],
        },
      ],
    },
  });
  return { status: 200, body: { ok: true, balance: l.balanceCents / 100, bills: open.length } };
}
