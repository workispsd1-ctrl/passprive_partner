import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { accountCents, ledger, allocate } = await import("./customerAccounts.js");

const full = { id: "b1", table_no: 3, order_details: { payment: { method: "ACCOUNT", amount_due: 1200, at: "2026-11-20T12:00:00Z" } } };
const part = { id: "b2", table_no: 5, order_details: { payments: [{ method: "CASH", amount: 300 }, { method: "ACCOUNT", amount: 700 }], payment: { at: "2026-11-21T12:00:00Z" } } };
const mixed = { id: "b3", table_no: 1, order_details: { payment: { method: "CARD", split: [{ method: "CASH", amount: 100 }, { method: "ACCOUNT", amount: 400 }], at: "2026-11-22T12:00:00Z" } } };

test("only the part put on the account counts as owed", () => {
  assert.deepEqual([accountCents(full), accountCents(part), accountCents(mixed)], [120000, 70000, 40000]);
  assert.equal(accountCents({ order_details: { payment: { method: "CASH", amount_due: 50 } } }), 0);
});

test("payments reduce what is owed, oldest bills first unless bills are ticked", () => {
  const before = ledger([mixed, full, part], []);
  assert.deepEqual(before.bills.map((b) => b.order_id), ["b1", "b2", "b3"]);
  assert.equal(before.balanceCents, 230000);
  const fifo = allocate(before.bills, 150000);
  assert.deepEqual(fifo.allocations, [{ order_id: "b1", amount: 1200 }, { order_id: "b2", amount: 300 }]);
  const ticked = allocate(before.bills, 40000, ["b3"]);
  assert.deepEqual(ticked.allocations, [{ order_id: "b3", amount: 400 }]);
  const after = ledger([full, part, mixed], [{ amount: 1500, allocations: fifo.allocations }]);
  assert.equal(after.balanceCents, 80000);
  assert.deepEqual(after.bills.map((b) => b.open), [0, 40000, 40000]);
});
