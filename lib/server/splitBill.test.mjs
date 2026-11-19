import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { payBillPart, planFit, splitState } = await import("./splitBill.js");

function fakeDb(row) {
  const db = { row: structuredClone(row) };
  db.from = (table) => {
    const q = { filters: {}, patch: null };
    const chain = {
      select: () => chain,
      eq: (k, v) => ((q.filters[k] = v), chain),
      in: () => chain,
      order: () => chain,
      not: () => chain,
      update: (patch) => ((q.patch = patch), chain),
      maybeSingle: async () => ({ data: table === "offer_redemptions" ? null : structuredClone(db.row), error: null }),
      then: (resolve) => {
        if (q.patch && q.filters.updated_at === db.row.updated_at) {
          db.row = { ...db.row, ...structuredClone(q.patch), updated_at: `${db.row.updated_at}+` };
          return resolve({ data: [{ id: db.row.id }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  };
  return db;
}

const order = {
  id: "o1",
  total_amount: 1170,
  tip_amount: 0,
  payment_status: "PENDING",
  booking_status: "SERVED",
  updated_at: "t0",
  order_details: {},
  order_items: [
    { item_id: "a", name: "Pasta", qty: 2, unit_price: 390, line_total: 780, line_key: "a||" },
    { item_id: "b", name: "Cola", qty: 1, unit_price: 390, line_total: 390, line_key: "b||" },
  ],
};

test("split by items then amount; closes at zero with per-method breakdown", async () => {
  const db = fakeDb(order);
  const pay = (body) => payBillPart(db, "r1", "u1", { order_id: "o1", ...body }, "t1");

  let r = await pay({ idempotency_key: "k1", method: "CARD", items: [{ line_key: "a||", qty: 1 }], tip_amount: 50, paid_cents: 44000 });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.remaining, 780);
  assert.equal(r.body.closed, false);

  r = await pay({ idempotency_key: "k1", method: "CARD", items: [{ line_key: "a||", qty: 1 }], tip_amount: 50 });
  assert.equal(r.body.payments.length, 1);

  r = await pay({ idempotency_key: "k2", method: "CASH", items: [{ line_key: "a||", qty: 2 }] });
  assert.equal(r.body.ok, false);

  r = await pay({ idempotency_key: "k3", method: "CASH", amount: 400 });
  assert.equal(r.body.ok, false);
  assert.match(r.body.error, /split by items/);

  r = await pay({ idempotency_key: "k4", method: "CASH", items: [{ line_key: "a||", qty: 1 }], amount_received: 500 });
  assert.equal(r.body.part.change, 110);
  assert.equal(r.body.remaining, 390);

  r = await pay({ idempotency_key: "k5", method: "MAUCAS", items: [{ line_key: "b||", qty: 1 }], paid_cents: 39000 });
  assert.equal(r.body.closed, true);
  assert.equal(db.row.payment_status, "PAID");
  assert.equal(db.row.payment_method, "SPLIT");
  assert.equal(db.row.tip_amount, 50);
  assert.deepEqual(db.row.order_details.payment.split.map((p) => p.amount), [390, 390, 390]);
  assert.deepEqual(db.row.order_details.payment.tip_split, [{ method: "CARD", amount: 50 }]);

  r = await pay({ idempotency_key: "k6", method: "CASH", amount: 1 });
  assert.equal(r.body.ok, false);

  const st = splitState(db.row);
  assert.equal(st.remainingCents, 0);
  assert.equal(st.lines.find((l) => l.line_key === "a||").open_qty, 0);
});

test("split by amount stays open until fully paid and refuses items", async () => {
  const db = fakeDb(order);
  const pay = (body) => payBillPart(db, "r1", "u1", { order_id: "o1", ...body }, "t1");
  let r = await pay({ idempotency_key: "m1", method: "CASH", amount: 1000, amount_received: 1000 });
  assert.equal(r.body.closed, false);
  assert.equal(r.body.remaining, 170);
  assert.equal(db.row.payment_status, "PENDING");
  r = await pay({ idempotency_key: "m2", method: "CARD", items: [{ line_key: "b||", qty: 1 }] });
  assert.match(r.body.error, /split by amount/);
  r = await pay({ idempotency_key: "m3", method: "CARD", amount: 170, paid_cents: 17000 });
  assert.equal(r.body.closed, true);
  assert.equal(db.row.payment_status, "PAID");
});

function fakeDb2(row, request) {
  const db = { row: structuredClone(row), req: structuredClone(request) };
  db.from = (table) => {
    const q = { filters: {}, patch: null };
    const chain = {
      select: () => chain,
      eq: (k, v) => ((q.filters[k] = v), chain),
      in: () => chain,
      order: () => chain,
      not: () => chain,
      update: (patch) => ((q.patch = patch), chain),
      maybeSingle: async () => ({
        data: table === "offer_redemptions" ? null : table === "pos_payment_requests" ? structuredClone(db.req) : structuredClone(db.row),
        error: null,
      }),
      then: (resolve) => {
        if (table === "pos_payment_requests" && q.patch) {
          if (db.req.status === q.filters.status) db.req = { ...db.req, ...q.patch };
          return resolve({ data: [], error: null });
        }
        if (q.patch && q.filters.updated_at === db.row.updated_at) {
          db.row = { ...db.row, ...structuredClone(q.patch), updated_at: `${db.row.updated_at}+` };
          return resolve({ data: [{ id: db.row.id }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  };
  return db;
}

test("POS completes a Partner request using the request's own amount and tip", async () => {
  const req = { id: "q1", order_id: "o1", method: "CARD", amount: 500, tip: 20, items: null, status: "pending" };
  const db = fakeDb2(order, req);
  const r = await payBillPart(db, "r1", "u1", { order_id: "o1", request_id: "q1", idempotency_key: "p1", method: "CARD", paid_cents: 52000 }, "t1");
  assert.equal(r.body.ok, true);
  assert.equal(r.body.part.method, "CARD");
  assert.equal(r.body.part.amount, 500);
  assert.equal(r.body.part.tip, 20);
  assert.equal(r.body.part.request_id, "q1");
  assert.equal(db.req.status, "paid");
  assert.equal(db.req.part_no, 1);
  assert.equal(r.body.closed, false);

  const cancelled = fakeDb2(order, { ...req, status: "cancelled" });
  const c = await payBillPart(cancelled, "r1", "u1", { order_id: "o1", request_id: "q1", idempotency_key: "p2", paid_cents: 52000 }, "t1");
  assert.equal(c.body.ok, true);
  assert.equal(c.body.part.amount, 500);
  assert.equal(c.body.part.request_id, undefined);
});

test("waiting bills adjust after a free payment instead of blocking it", () => {
  const t2 = { ...order, total_amount: 2210, order_details: { payments: [{ no: 1, amount: 310, method: "CASH" }] } };
  const pending = [{ id: "b1", amount: 1000 }, { id: "b2", amount: 900 }];
  assert.deepEqual(planFit(splitState(t2), pending), { keep: ["b1", "b2"], shrink: [], drop: [] });
  const afterCash = { ...t2, order_details: { payments: [...t2.order_details.payments, { no: 2, amount: 500, method: "CASH" }] } };
  assert.deepEqual(planFit(splitState(afterCash), pending), { keep: ["b1"], shrink: [{ id: "b2", amount: 400 }], drop: [] });
  const paidAll = { ...t2, order_details: { payments: [{ no: 1, amount: 2210, method: "CARD" }] } };
  assert.deepEqual(planFit(splitState(paidAll), pending).drop, ["b1", "b2"]);
});

test("an items bill is dropped once its items are paid some other way", () => {
  const paidPasta = { ...order, order_details: { payments: [{ no: 1, amount: 780, method: "CASH", items: [{ line_key: "a||", qty: 2 }] }] } };
  const plan = planFit(splitState(paidPasta), [{ id: "i1", amount: 390, items: [{ line_key: "a||", qty: 1 }] }, { id: "i2", amount: 390, items: [{ line_key: "b||", qty: 1 }] }]);
  assert.deepEqual(plan, { keep: ["i2"], shrink: [], drop: ["i1"] });
});

test("pending POS requests reserve their share of the bill", async () => {
  const { reserve } = await import("./payRequests.js");
  const st = splitState(order);
  const free = reserve(st, [
    { amount: 390, items: [{ line_key: "a||", qty: 1 }] },
    { amount: 390, items: [{ line_key: "b||", qty: 1 }] },
  ]);
  assert.equal(free.remainingCents, 39000);
  assert.equal(free.lines.find((l) => l.line_key === "a||").open_qty, 1);
  assert.equal(free.lines.find((l) => l.line_key === "b||").open_qty, 0);
  assert.equal(reserve(st, [{ amount: 1170 }]).remainingCents, 0);
});

test("items split accepts the plain item id for lines saved without a line_key", async () => {
  const legacy = { ...order, order_items: order.order_items.map(({ line_key, ...it }) => it) };
  const db = fakeDb(legacy);
  const r = await payBillPart(db, "r1", "u1", { order_id: "o1", idempotency_key: "L1", method: "CASH", items: [{ line_key: "b", qty: 1 }] }, "t1");
  assert.equal(r.body.ok, true);
  assert.equal(r.body.remaining, 780);
});

test("a split bill sent without a method is paid with the method picked on the POS", async () => {
  const req = { id: "q2", order_id: "o1", method: null, amount: 585, tip: 0, items: null, status: "pending" };
  const db = fakeDb2(order, req);
  const r = await payBillPart(db, "r1", "u1", { order_id: "o1", request_id: "q2", idempotency_key: "c1", method: "CASH", amount_received: 600, tip_amount: 10 }, "t1");
  assert.equal(r.body.ok, true);
  assert.equal(r.body.part.method, "CASH");
  assert.equal(r.body.part.amount, 585);
  assert.equal(r.body.part.tip, 10);
  assert.equal(r.body.part.change, 5);
  assert.equal(db.req.status, "paid");
});

test("a bill sent for card can't be recorded as cash", async () => {
  const db = fakeDb2(order, { id: "q3", order_id: "o1", method: "CARD", amount: 500, tip: 0, items: null, status: "pending" });
  const r = await payBillPart(db, "r1", "u1", { order_id: "o1", request_id: "q3", idempotency_key: "x1", method: "CASH" }, "t1");
  assert.equal(r.body.ok, false);
  assert.equal(db.req.status, "pending");
});

test("part of a split bill can be paid; the rest stays on that bill", async () => {
  const db = fakeDb2(order, { id: "q5", order_id: "o1", method: null, amount: 1000, tip: 0, items: null, status: "pending" });
  const r = await payBillPart(db, "r1", "u1", { order_id: "o1", request_id: "q5", idempotency_key: "pp1", method: "CARD", amount: 600, paid_cents: 60000 }, "t1");
  assert.equal(r.body.ok, true);
  assert.equal(r.body.part.amount, 600);
  assert.equal(r.body.part.request_id, "q5");
  assert.equal(db.req.status, "pending");
  assert.equal(db.req.amount, 400);
});
