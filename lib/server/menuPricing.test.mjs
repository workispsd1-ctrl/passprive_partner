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
