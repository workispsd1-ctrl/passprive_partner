import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { splitByStation } = await import("./printJobs.js");

test("an order splits into a kitchen ticket and a bar ticket; unknown items go to the kitchen", () => {
  const stations = new Map([["burger", "kitchen"], ["mojito", "bar"]]);
  const out = splitByStation(
    [
      { item_id: "burger", name: "Beef Please", qty: 1 },
      { item_id: "mojito", name: "Mojito", qty: 2 },
      { item_id: "gone", name: "Old item", qty: 1 },
    ],
    stations
  );
  assert.deepEqual(out.kitchen.map((i) => i.name), ["Beef Please", "Old item"]);
  assert.deepEqual(out.bar.map((i) => i.name), ["Mojito"]);
});
