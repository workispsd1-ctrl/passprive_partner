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

test("items: every item with category and share, unsold menu items listed, report builds", async () => {
  const { statsMenu, statsReport, previousPeriod, compareTotals } = await import("./tillStats.js");
  const menu = statsMenu({
    sections: [
      { name: "Mains", items: [{ id: "p", name: "Pasta" }, { id: "s", name: "Steak" }, { id: "x", name: "Gone", is_available: false }] },
      { name: "Drinks", group: "Bar", items: [{ id: "c", name: "Cola" }] },
    ],
  });
  const sale = tableSale({
    total_amount: 980,
    source: "cashier",
    order_items: [
      { item_id: "p", name: "Pasta", qty: 2, line_total: 780 },
      { item_id: "c", name: "Cola", qty: 2, line_total: 200 },
    ],
    order_details: { payment: { method: "CASH", at: "2026-11-18T10:00:00Z" } },
  });
  const s = tillStats([sale], [], menu);
  assert.deepEqual(s.items.map((i) => [i.name, i.category, i.kind, i.share]), [["Pasta", "Mains", "Kitchen", 79.6], ["Cola", "Drinks", "Bar", 20.4]]);
  assert.deepEqual(s.categories.map((c) => [c.name, c.qty, c.amount]), [["Mains", 2, 780], ["Drinks", 2, 200]]);
  assert.deepEqual(s.not_sold.map((i) => i.name), ["Steak"]);
  assert.deepEqual(previousPeriod("2026-11-15", "2026-11-21"), { from: "2026-11-08", to: "2026-11-14", days: 7 });
  assert.equal(compareTotals(s.journal, { total: 490 }).change_pct, 100);
  const report = statsReport({ ...s, compare: null }, { period: "2026-11-18", withItems: true });
  assert.equal(report.sections.find((x) => x.title === "BEST SELLERS").rows[0].label, "1. 2 x Pasta");
  assert.ok(report.sections.some((x) => x.title === "MAINS"));
  assert.deepEqual(report.sections[0].rows.slice(0, 3).map((r) => r.label), ["Sales excl. 15% VAT", "+ VAT 15%", "= Total sales (incl. VAT)"]);
  const bills = statsReport({ ...s, compare: null }, { period: "2026-11-18", sales: [sale] });
  const every = bills.sections.find((x) => x.title === "EVERY BILL (1)");
  assert.equal(every.rows[0].label, "14:00 Dine-in Cash");
  assert.equal(every.rows[0].value, "980.00");
});
