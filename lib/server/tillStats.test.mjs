import { test } from "node:test";
import assert from "node:assert/strict";
import { tableSale, tillStats, vatSplit } from "./tillStats.js";

test("VAT: inclusive 15% carved out, legacy stored VAT kept", () => {
  assert.deepEqual(vatSplit(115000, 0), { tax: 15000, included: true });
  assert.deepEqual(vatSplit(49000, 0), { tax: 6391, included: true });
  assert.deepEqual(vatSplit(115000, 15000), { tax: 15000, included: false });
});

test("stats: tips separate from sales, items excl VAT", () => {
  const paid = (total, tip, items, tax = 0, method = "CARD") =>
    tableSale({
      total_amount: total,
      tax_amount: tax,
      tip_amount: tip,
      source: "cashier",
      order_items: items,
      order_details: { payment: { method, at: "2026-11-18T10:00:00Z", ...(tip ? { tip, tip_method: method } : {}) } },
    });
  const s = tillStats([
    paid(1150, 100, [{ item_id: "p", name: "Pasta", qty: 2, line_total: 1150 }]),
    paid(690, 0, [{ item_id: "p", name: "Pasta", qty: 1, line_total: 690 }], 0, "CASH"),
    paid(115, 0, [{ item_id: "c", name: "Cola", qty: 1, line_total: 100 }], 15, "CASH"),
  ]);
  assert.equal(s.journal.total, 1955);
  assert.equal(s.journal.vat, 150 + 90 + 15);
  assert.equal(s.journal.excl_vat, 1955 - 255);
  assert.equal(s.journal.tips, 100);
  assert.equal(s.journal.tipped_bills, 1);
  assert.equal(s.journal.collected, 2055);
  assert.deepEqual(s.tip_methods, [{ key: "CARD", amount: 100, share: 100 }]);
  const pasta = s.top_items.find((i) => i.name === "Pasta");
  assert.equal(pasta.amount, 1840);
  assert.equal(pasta.excl_vat, 1000 + 600);
  assert.equal(s.top_items.find((i) => i.name === "Cola").excl_vat, 100);
});
