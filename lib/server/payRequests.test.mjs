import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { cancelPayRequest, claimPayRequest, createPayRequest, failPayRequest, retryPayRequest, otherPosBlocked, FAILOVER_MS } = await import("./payRequests.js");

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
      or: (expr) => {
        const parts = expr.split(",").map((p) => {
          const [k, op, ...rest] = p.split(".");
          const v = rest.join(".");
          return (r) => (op === "is" ? (r[k] ?? null) === null : op === "eq" ? r[k] === v : (r[k] ?? "") < v);
        });
        filters.push((r) => parts.some((f) => f(r)));
        return chain;
      },
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
  assert.equal(again.body.ok, true);
  assert.equal(again.body.request.amount, 1000);
  assert.equal(db.tables.pos_payment_requests[0].status, "cancelled");
  Object.assign(db.tables.pos_payment_requests[1], { claimed_by: "posA", claimed_at: new Date().toISOString() });
  const busy = await createPayRequest(db, "r1", "u1", { order_id: "o1", method: "CARD", full: true });
  assert.match(busy.body.error, /paying on the POS right now/);
  const cancel = await cancelPayRequest(db, "r1", "u1", { request_id: "req2" });
  assert.match(cancel.body.error, /paying on the POS right now/);
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

test("a failed POS payment frees the bill, shows why, and the POS can retry it", async () => {
  const db = fakeDb({
    restaurant_table_bookings: [bill],
    pos_payment_requests: [{ id: "q1", restaurant_id: "r1", order_id: "o1", status: "pending", method: "MAUCAS", amount: 1000, claimed_by: "posA", claimed_at: new Date().toISOString() }],
    offer_redemptions: [],
  });
  const other = await failPayRequest(db, "r1", "posB", { request_id: "q1", code: "-7", message: "network error" });
  assert.equal(other.body.failed, false);
  const failed = await failPayRequest(db, "r1", "posA", { request_id: "q1", code: "-7", message: "network error" });
  assert.equal(failed.body.failed, true);
  const row = db.tables.pos_payment_requests[0];
  assert.deepEqual([row.status, row.reason, row.claimed_by], ["failed", "network error (-7)", null]);
  const retry = await retryPayRequest(db, "r1", "posA", { request_id: "q1" });
  assert.equal(retry.body.ok, true);
  assert.deepEqual([row.status, row.claimed_by], ["pending", "posA"]);
  row.status = "failed";
  const fresh = await createPayRequest(db, "r1", "u1", { order_id: "o1", method: "CARD", full: true });
  assert.equal(fresh.body.ok, true);
  const late = await retryPayRequest(db, "r1", "posA", { request_id: "q1" });
  assert.match(late.body.error, /already sent a new payment/);
});

test("targeted request stays on its POS until the failover window passes", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const row = { target_terminal_id: "a", claimed_by: null, created_at: new Date(now - 5000).toISOString() };
  const late = new Date(now - FAILOVER_MS - 1).toISOString();
  assert.equal(otherPosBlocked(row, "a", now), false);
  assert.equal(otherPosBlocked(row, "b", now), true);
  assert.equal(otherPosBlocked({ ...row, created_at: late }, "b", now), false);
  assert.equal(otherPosBlocked({ ...row, created_at: late, claimed_by: "a" }, "b", now), true);
  assert.equal(otherPosBlocked({ ...row, target_terminal_id: null }, "b", now), false);
});
