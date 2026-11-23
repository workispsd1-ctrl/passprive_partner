import { test } from "node:test";
import assert from "node:assert/strict";
import { closingReport } from "./closingReport.js";
import { tillStats } from "./tillStats.js";

test("closing report follows the old till layout, in French, with cash and staff totals", () => {
  const sale = (amount, method, by) => ({
    at: "2026-11-22T10:00:00Z", amount: amount * 100, tax: 0, guests: 2, method, channel: "dine_in",
    items: [{ item_id: "b", name: "Beer", qty: 1, unit_price: amount, line_total: amount }],
    seller: by, tenders: [{ method, cents: amount * 100, by, received: method === "CASH" ? amount * 100 + 500 : 0, change: method === "CASH" ? 500 : 0 }],
  });
  const stats = tillStats([sale(100, "CASH", "u1"), sale(200, "CARD", "u1")], [], new Map([["b", { name: "Beer", category: "Bieres", kind: "Bar", available: true }]]));
  const r = closingReport(stats, { from: "2026-11-22", to: "2026-11-22", lang: "fr", merchant: { name: "CocoChill" }, names: { u1: "Bhavesh" } });
  const text = r.lines.map((l) => l.text || "").join("\n");
  const order = ["Clôture de période", "Dimanche 22 novembre 2026", "Notes supprimées : 0", "Période", "Total TTC : 300,00Rs", "2 Tickets", "Rubriques", "2 BIERES : 300,00Rs", "Utilisateurs (Règlements)", "BHAVESH : 300,00", "ESPÈCES : 105,00Rs", "RENDU MONNAIE : -5,00Rs", "ESPÈCES NET : 100,00Rs", "1 CARTE BANCAIRE : 200,00", "Taux VAT", "Modes de vente", "Offerts", "Réservations"];
  let at = -1;
  for (const piece of order.filter((p) => p !== "Réservations")) {
    const i = text.indexOf(piece, at + 1);
    assert.ok(i > at, `missing or out of order: ${piece}`);
    at = i;
  }
  assert.equal(closingReport(stats, { from: "2026-11-22", to: "2026-11-22" }).lines.find((l) => /^Total incl/.test(l.text || "")).text, "Total incl. VAT : 300.00Rs");
});
