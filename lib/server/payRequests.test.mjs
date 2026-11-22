import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { claimPayRequest, createPayRequest } = await import("./payRequests.js");

function fakeDb(tables) {
  const db = { tables: structuredClone(tables) };
  db.from = (name) => {
    const rows = (db.tables[name] ||= []);
    const filters = [];
    let patch = null;
    let insert = null;
    const match = (r) => filters.every((f) => f(r));
    const chain = {
      select: () => chain,
      eq: (k, v) => (filters.push((r) => r[k] === v), chain),
      neq: (k, v) => (filters.push((r) => r[k] !== v), chain),
      is: (k, v) => (filters.push((r) => (r[k] ?? null) === v), chain),
      lt: (k, v) => (filters.push((r) => r[k] < v), chain),
      gte: () => chain,
      in: (k, vs) => (filters.push((r) => vs.includes(r[k])), chain),
      order: () => chain,
      limit: () => chain,
      update: (p) => ((patch = p), chain),
      insert: (r) => ((insert = { id: `req${rows.length + 1}`, status: "pending", ...r }), chain),
      maybeSingle: async () => ({ data: structuredClone(rows.find(match) ?? null), error: null }),
      single: async () => {
        if (insert) {
          rows.push(insert);
          return { data: structuredClone(insert), error: null };
        }
        return { data: structuredClone(rows.find(match) ?? null), error: null };
      },
      then: (resolve) => {
        const hit = rows.filter(match);
        if (patch) hit.forEach((r) => Object.assign(r, patch));
        return resolve({ data: structuredClone(hit), error: null });
      },
    };
    return chain;
  };
  return db;
}

const bill = {
  id: "o1",
  restaurant_id: "r1",
  total_amount: 1000,
  payment_status: "PENDING",
  booking_status: "COMPLETED",
  order_details: {},
  order_items: [{ item_id: "a", name: "Pasta", qty: 2, unit_price: 500, line_total: 1000, line_key: "a||" }],
};

test("full card request takes the amount from the server and refuses a second one", async () => {
  const db = fakeDb({ restaurant_table_bookings: [bill], pos_payment_requests: [], offer_redemptions: [] });
  const first = await createPayRequest(db, "r1", "u1", { order_id: "o1", method: "CARD", full: true, amount: 1 });
  assert.equal(first.body.ok, true);
  assert.equal(first.body.request.amount, 1000);
  assert.equal(first.body.request.method, "CARD");
  const again = await createPayRequest(db, "r1", "u1", { order_id: "o1", method: "MAUCAS", full: true });
  assert.equal(again.body.ok, false);
  assert.match(again.body.error, /already waiting on the POS/);
  const noMethod = await createPayRequest(fakeDb({ restaurant_table_bookings: [bill] }), "r1", "u1", { order_id: "o1", full: true });
  assert.match(noMethod.body.error, /Card or MauCas/);
});

test("only one POS wins a claim, and only a fresh claim may auto-start", async () => {
  const db = fakeDb({ pos_payment_requests: [{ id: "q1", restaurant_id: "r1", status: "pending", method: "CARD", claimed_by: null, claimed_at: null }] });
  const a = await claimPayRequest(db, "r1", "posA", "q1");
  assert.deepEqual([a.body.claimed, a.body.fresh], [true, true]);
  const b = await claimPayRequest(db, "r1", "posB", "q1");
  assert.equal(b.body.claimed, false);
  const again = await claimPayRequest(db, "r1", "posA", "q1");
  assert.deepEqual([again.body.claimed, again.body.fresh], [true, false]);
  db.tables.pos_payment_requests[0].claimed_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const takeover = await claimPayRequest(db, "r1", "posB", "q1");
  assert.deepEqual([takeover.body.claimed, takeover.body.fresh], [true, false]);
  db.tables.pos_payment_requests[0].status = "paid";
  const done = await claimPayRequest(db, "r1", "posA", "q1");
  assert.equal(done.body.claimed, false);
});
