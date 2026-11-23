import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { withoutHeld, openLinesFor } = await import("./splitBill.js");

const held = [
  { id: "r1", amount: 450, items: [{ line_key: "p||", qty: 1 }] },
  { id: "r2", amount: 175, items: [{ line_key: "b||", qty: 1 }] },
];
const admin = { from: () => { const c = { select: () => c, eq: () => c, then: (ok) => ok({ data: held, error: null }) }; return c; } };
const state = { remainingCents: 107500, lines: [{ line_key: "p||", open_qty: 2 }, { line_key: "b||", open_qty: 1 }] };

test("pay the rest leaves out shares already waiting on the POS, except the one being paid", async () => {
  const free = await withoutHeld(admin, "r", "o", state, "r2");
  assert.equal(free.remainingCents, 107500 - 45000);
  assert.deepEqual(openLinesFor(free, null, true), [{ line_key: "p||", qty: 1 }, { line_key: "b||", qty: 1 }]);
});
