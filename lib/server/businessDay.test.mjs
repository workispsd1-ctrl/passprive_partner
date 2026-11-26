import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { openBills } = await import("./businessDay.js");

test("open bills block closing, QR orders still waiting for staff do not", () => {
  const rows = [
    { id: "b", table_no: 12, customer_name: "Ann", total_amount: "450.50", order_details: {} },
    { id: "a", table_no: 3, customer_name: null, total_amount: 0, order_details: {} },
    { id: "q", table_no: 7, total_amount: 90, order_details: { qr_pending: true } },
  ];
  assert.deepEqual(openBills(rows).map((b) => [b.id, b.table_no, b.total]), [["a", 3, 0], ["b", 12, 450.5]]);
});
