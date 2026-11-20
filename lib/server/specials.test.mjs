import { test } from "node:test";
import assert from "node:assert/strict";
import { specialItem } from "./specials.js";

test("special dish input is cleaned and checked", () => {
  const ok = specialItem({ name: "  Fish   curry ", price: "350.555", kind: "Bar", is_veg: "yes" }, "x");
  assert.equal(ok.kind, "Bar");
  assert.deepEqual([ok.item.id, ok.item.name, ok.item.price, ok.item.is_veg, ok.item.is_available], ["x", "Fish curry", 350.56, false, true]);
  assert.equal(specialItem({ name: "A", price: 10 }).kind, "Kitchen");
  assert.ok(specialItem({ name: "", price: 10 }).error);
  for (const price of [0, -5, "abc", 1e6]) assert.ok(specialItem({ name: "A", price }).error);
});
