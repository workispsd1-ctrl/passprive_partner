import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { payBillPart, splitState } = await import("./splitBill.js");

function fakeDb(row) {
  const db = { row: structuredClone(row) };
  db.from = (table) => {
    const q = { filters: {}, patch: null };
    const chain = {
      select: () => chain,
      eq: (k, v) => ((q.filters[k] = v), chain),
      in: () => chain,
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

  r = await pay({ idempotency_key: "k3", method: "CASH", amount: 800 });
  assert.equal(r.body.ok, false);

  r = await pay({ idempotency_key: "k4", method: "CASH", amount: 400, amount_received: 500 });
  assert.equal(r.body.part.change, 100);
  assert.equal(r.body.remaining, 380);

  r = await pay({ idempotency_key: "k5", method: "MAUCAS", amount: 380, paid_cents: 38000 });
  assert.equal(r.body.closed, true);
  assert.equal(db.row.payment_status, "PAID");
  assert.equal(db.row.payment_method, "SPLIT");
  assert.equal(db.row.tip_amount, 50);
  assert.deepEqual(db.row.order_details.payment.split.map((p) => p.amount), [390, 400, 380]);
  assert.deepEqual(db.row.order_details.payment.tip_split, [{ method: "CARD", amount: 50 }]);

  r = await pay({ idempotency_key: "k6", method: "CASH", amount: 1 });
  assert.equal(r.body.ok, false);

  const st = splitState(db.row);
  assert.equal(st.remainingCents, 0);
  assert.equal(st.lines.find((l) => l.line_key === "a||").open_qty, 1);
});
