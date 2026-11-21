import { test } from "node:test";
import assert from "node:assert/strict";
import { findLine, lineKey, menuIndex, mergeLines, priceLines } from "./menuPricing.js";

const menu = {
  sections: [
    {
      id: "s1",
      items: [
        {
          id: "burger",
          name: "Burger",
          price: 390.5,
          modifier_groups: [
            { id: "size", name: "Size", min: 1, max: 1, options: [{ id: "reg", name: "Regular", price: 0 }, { id: "lg", name: "Large", price: 100 }] },
            { id: "extra", name: "Extras", min: 0, max: 2, options: [{ id: "chz", name: "Cheese", price: 49.9 }, { id: "bcn", name: "Bacon", price: 60 }, { id: "egg", name: "Egg", price: 30, is_available: false }] },
          ],
        },
        { id: "cola", name: "Cola", price: 80 },
        {
          id: "pasta",
          name: "Pasta La Vista",
          price: 0,
          variants: [
            { id: "tom", name: "Tomate", price: 490 },
            { id: "mar", name: "Marlin", price: 690 },
            { id: "off", name: "Off", price: 500, is_available: false },
          ],
          modifier_groups: [{ id: "x", name: "Extras", min: 0, max: 1, options: [{ id: "parm", name: "Parmesan", price: 50 }] }],
        },
        { id: "gone", name: "Gone", variants: [{ id: "g", name: "G", price: 1, is_available: false }] },
      ],
    },
  ],
};
const index = menuIndex(menu);

test("prices base + options in cents", () => {
  const out = priceLines([{ item_id: "burger", quantity: 3, modifiers: ["chz", "lg"] }], index);
  assert.equal(out.lines[0].unit_price, 540.4);
  assert.equal(out.lines[0].line_total, 1621.2);
  assert.equal(out.subtotalCents, 162120);
  assert.deepEqual(out.lines[0].modifiers.map((m) => m.id), ["lg", "chz"]);
});

test("enforces required, max, unknown and unavailable options", () => {
  assert.equal(priceLines([{ item_id: "burger", quantity: 1 }], index), null);
  assert.equal(priceLines([{ item_id: "burger", quantity: 1, modifiers: ["reg", "lg"] }], index), null);
  assert.equal(priceLines([{ item_id: "burger", quantity: 1, modifiers: ["reg", "chz", "bcn", "egg"] }], index), null);
  assert.equal(priceLines([{ item_id: "burger", quantity: 1, modifiers: ["reg", "nope"] }], index), null);
  assert.equal(priceLines([{ item_id: "cola", quantity: 1, modifiers: ["chz"] }], index), null);
  assert.ok(priceLines([{ item_id: "burger", quantity: 1, modifiers: ["reg", "chz", "bcn"] }], index));
});

test("note and options split lines; same choices merge", () => {
  const out = priceLines(
    [
      { item_id: "burger", quantity: 1, modifiers: ["reg"], note: "no onion" },
      { item_id: "burger", quantity: 1, modifiers: ["reg"] },
      { item_id: "burger", quantity: 2, modifiers: ["reg"], note: "  No   Onion " },
      { item_id: "cola", qty: 1 },
    ],
    index
  );
  assert.equal(out.lines.length, 3);
  assert.equal(out.lines[0].qty, 3);
  assert.equal(out.lines[0].note, "no onion");
  const merged = mergeLines(out.lines, priceLines([{ item_id: "cola", qty: 2 }], index).lines);
  assert.equal(merged.find((l) => l.item_id === "cola").qty, 3);
  assert.equal(merged.find((l) => l.item_id === "cola").line_total, 240);
  assert.equal(findLine(merged, out.lines[1].line_key), 1);
  assert.equal(findLine([{ item_id: "old", name: "Old", qty: 1 }], "old"), 0);
  assert.equal(lineKey({ item_id: "cola" }), "cola||");
});

test("variants: full price per variant, required, split lines", () => {
  const out = priceLines(
    [
      { item_id: "pasta", qty: 1, variant_id: "mar", modifiers: ["parm"] },
      { item_id: "pasta", qty: 2, variant_id: "tom" },
      { item_id: "pasta", qty: 1, variant_id: "tom" },
    ],
    index
  );
  assert.equal(out.lines.length, 2);
  assert.equal(out.lines[0].unit_price, 740);
  assert.equal(out.lines[0].name, "Pasta La Vista – Marlin");
  assert.deepEqual(out.lines[0].variant, { id: "mar", name: "Marlin" });
  assert.equal(out.lines[1].qty, 3);
  assert.equal(out.subtotalCents, 74000 + 3 * 49000);
  assert.equal(out.lines[1].line_key, "pasta~tom||");
  assert.equal(priceLines([{ item_id: "pasta", qty: 1 }], index), null);
  assert.equal(priceLines([{ item_id: "pasta", qty: 1, variant_id: "off" }], index), null);
  assert.equal(priceLines([{ item_id: "cola", qty: 1, variant_id: "tom" }], index), null);
  assert.equal(index.has("gone"), false);
});

test("a dish sold out today cannot be ordered; it comes back the next day", async () => {
  const { menuIndex: index } = await import("./menuPricing.js");
  const { mauritiusToday } = await import("../soldOut.js");
  const menu = { sections: [{ id: "s", items: [
    { id: "a", name: "A", price: 100, sold_out_on: mauritiusToday() },
    { id: "b", name: "B", price: 100, sold_out_on: "2020-01-01" },
    { id: "c", name: "C", price: 100 },
  ] }] };
  const idx = index(menu);
  assert.equal(idx.has("a"), false);
  assert.equal(idx.has("b"), true);
  assert.equal(idx.has("c"), true);
  assert.equal(mauritiusToday(Date.parse("2026-11-20T20:30:00Z")), "2026-11-21");
});

test("ice cream: one flavour per scoop, same flavour can repeat", () => {
  const menu = { sections: [{ id: "s", items: [{
    id: "ice", name: "Ice cream",
    variants: [{ id: "one", name: "1 scoop", price: 120, picks: 1 }, { id: "two", name: "2 scoops", price: 220, picks: 2 }],
    modifier_groups: [
      { id: "fl", name: "Flavour", per_pick: true, options: [{ id: "van", name: "Vanilla", price: 0 }, { id: "cho", name: "Chocolate", price: 10 }] },
      { id: "top", name: "Topping", min: 0, max: 1, options: [{ id: "nuts", name: "Nuts", price: 15 }] },
    ],
  }] }] };
  const idx = menuIndex(menu);
  const two = priceLines([{ item_id: "ice", variant_id: "two", quantity: 1, modifiers: ["van", "van"] }], idx);
  assert.equal(two.lines[0].unit_price, 220);
  assert.deepEqual(two.lines[0].modifiers.map((m) => [m.name, m.price]), [["2× Vanilla", 0]]);
  const mixed = priceLines([{ item_id: "ice", variant_id: "two", quantity: 2, modifiers: ["cho", "van", "nuts"] }], idx);
  assert.equal(mixed.lines[0].unit_price, 245);
  assert.equal(mixed.subtotalCents, 49000);
  assert.equal(priceLines([{ item_id: "ice", variant_id: "two", quantity: 1, modifiers: ["van"] }], idx), null);
  assert.equal(priceLines([{ item_id: "ice", variant_id: "one", quantity: 1, modifiers: ["van", "cho"] }], idx), null);
  assert.equal(priceLines([{ item_id: "ice", variant_id: "two", quantity: 1, modifiers: ["van", "van", "nuts", "nuts"] }], idx).lines[0].unit_price, 235);
  const a = priceLines([{ item_id: "ice", variant_id: "two", quantity: 1, modifiers: ["van", "van"] }], idx).lines[0].line_key;
  const b = priceLines([{ item_id: "ice", variant_id: "two", quantity: 1, modifiers: ["van", "cho"] }], idx).lines[0].line_key;
  assert.notEqual(a, b);
  assert.equal(lineKey(two.lines[0]), a);
});
