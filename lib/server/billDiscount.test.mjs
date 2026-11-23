import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { priceLine, repriceAll, totalsOf, billPct } = await import("./billDiscount.js");
const { mergeLines } = await import("./menuPricing.js");

const pasta = { item_id: "p", name: "Pasta", qty: 2, unit_price: 450, line_total: 900, line_key: "p||" };
const beer = { item_id: "b", name: "Beer", qty: 1, unit_price: 175, line_total: 175, line_key: "b||" };

test("dish discount lowers that line, keeps the list price and gets its own key", () => {
  const off = priceLine({ ...pasta, discount_pct: 10 }, 0);
  assert.deepEqual([off.unit_price, off.line_total, off.list_price, off.line_key], [405, 810, 450, "p|||%10"]);
  const back = priceLine({ ...off, discount_pct: 0 }, 0);
  assert.deepEqual([back.unit_price, back.line_total, back.list_price, back.line_key], [450, 900, undefined, "p||"]);
});

test("bill discount stacks on dish discounts and survives later additions", () => {
  const items = repriceAll([{ ...pasta, discount_pct: 10 }, beer], 20);
  assert.equal(totalsOf(items).total_amount, 324 * 2 + 140);
  const more = mergeLines(items, [priceLine({ ...beer }, 20)]);
  assert.equal(more.find((l) => l.item_id === "b").qty, 2);
  assert.equal(totalsOf(more).total_amount, 648 + 280);
  const removed = repriceAll(more, 0);
  assert.equal(totalsOf(removed).total_amount, 810 + 350);
  assert.equal(billPct({ bill_discount: { pct: 15 } }), 15);
  assert.equal(billPct({ bill_discount: { pct: 100 } }), 0);
});
