import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { priceLine, repriceAll, totalsOf, billPct, splitDiscount } = await import("./billDiscount.js");
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
  assert.equal(billPct({ bill_discount: { pct: 100 } }), 100);
  assert.equal(billPct({ bill_discount: { pct: 101 } }), 0);
});

test("100% on the whole bill offers everything and keeps the list prices", () => {
  const items = repriceAll([{ ...pasta, discount_pct: 10 }, beer], 100);
  assert.equal(totalsOf(items).total_amount, 0);
  assert.deepEqual(items.map((l) => l.list_price), [450, 175]);
});

test("a discount on 1 of 3 identical dishes splits the line, and removing it merges them back", () => {
  const three = { ...beer, qty: 3, line_total: 525 };
  const split = repriceAll(splitDiscount([pasta, three], three, 1, 100), 0);
  const beers = split.filter((l) => l.item_id === "b");
  assert.deepEqual(beers.map((l) => [l.qty, l.unit_price, l.discount_pct ?? 0]), [[2, 175, 0], [1, 0, 100]]);
  assert.equal(totalsOf(split).total_amount, 900 + 350);
  const offered = beers.find((l) => l.discount_pct === 100);
  const back = repriceAll(splitDiscount(split, split.find((l) => l.line_key === offered.line_key), 1, 0), 0);
  assert.deepEqual(back.filter((l) => l.item_id === "b").map((l) => [l.qty, l.unit_price]), [[3, 175]]);
  const all = repriceAll(splitDiscount([three], three, 3, 10), 0);
  assert.deepEqual(all.map((l) => [l.qty, l.unit_price]), [[3, 157.5]]);
});
