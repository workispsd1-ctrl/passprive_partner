import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { mergeBills, earlierStage } = await import("./changeTable.js");

test("merging keeps every item, payment, tip and guest", () => {
  const t2 = {
    id: "a", table_no: 2, guest_count: 2, tip_amount: 20, booking_status: "COMPLETED",
    order_items: [{ item_id: "p", name: "Pasta", qty: 1, unit_price: 490, line_total: 490, line_key: "p||" }],
    order_details: { payments: [{ no: 1, id: "k1", amount: 200, method: "CASH" }] },
  };
  const t5 = {
    id: "b", table_no: 5, guest_count: 3, tip_amount: 0, booking_status: "PREPARING",
    order_items: [
      { item_id: "p", name: "Pasta", qty: 2, unit_price: 490, line_total: 980, line_key: "p||" },
      { item_id: "c", name: "Cola", qty: 1, unit_price: 100, line_total: 100, line_key: "c||" },
    ],
    order_details: { payments: [{ no: 1, id: "k2", amount: 100, method: "CARD" }] },
  };
  const m = mergeBills(t5, t2, "u1", "now");
  assert.equal(m.total_amount, 1570);
  assert.equal(m.order_items.find((i) => i.line_key === "p||").qty, 3);
  assert.deepEqual(m.order_details.payments.map((p) => [p.no, p.id]), [[1, "k2"], [2, "k1"]]);
  assert.equal(m.tip_amount, 20);
  assert.equal(m.guest_count, 5);
  assert.equal(m.booking_status, "PREPARING");
  assert.equal(m.order_details.merged_from[0].order_id, "a");
});

test("the merged bill takes the earlier stage", () => {
  assert.equal(earlierStage("COMPLETED", "SERVED"), "SERVED");
  assert.equal(earlierStage("PLACED", "COMPLETED"), "PLACED");
});

test("only tables in the layout can be used; attached tables resolve to their host", async () => {
  const { hostTable } = await import("./changeTable.js");
  const db = (rows) => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) });
  const layout = [
    { id: "a", table_no: 1, attached_to: null },
    { id: "b", table_no: 2, attached_to: "a" },
  ];
  assert.equal(await hostTable(db(layout), "r", 1), 1);
  assert.equal(await hostTable(db(layout), "r", 2), 1);
  assert.equal(await hostTable(db(layout), "r", 99), null);
  assert.equal(await hostTable(db([]), "r", 7), 7);
});
