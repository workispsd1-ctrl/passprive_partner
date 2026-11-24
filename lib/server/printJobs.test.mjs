import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { splitByStation, queueOrderTicket } = await import("./printJobs.js");

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

test("with only a main (receipts) printer, order tickets print on the main printer", async () => {
  const inserted = [];
  const main = { id: "p1", name: "Main", ip: "10.0.0.5", port: 9100, paper_mm: 80, prints: ["receipts"], backup_printer_id: null };
  const chain = (data) => {
    const q = { select: () => q, eq: () => q, gte: () => q, limit: () => q, order: () => Promise.resolve({ data }), maybeSingle: () => Promise.resolve({ data: null }) };
    return q;
  };
  const admin = {
    from: (t) => (t === "print_jobs" ? { insert: async (row) => (inserted.push(row), { error: null }) } : chain(t === "restaurant_printers" ? [main] : [])),
  };
  await queueOrderTicket(admin, "r1", { orderId: "o1", tableNo: 2, lines: [{ name: "Burger", qty: 1 }], source: "Till" });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].printer_id, "p1");
  assert.equal(inserted[0].payload.printer.ip, "10.0.0.5");
});

test("kitchen tickets use the dish's kitchen label when it has one", async () => {
  const { ticketItems } = await import("./printJobs.js");
  const lines = [
    { item_id: "a", name: "Panier Gajak 12pc – Mixte", variant: { name: "Mixte" }, qty: 2, modifiers: [{ name: "Extra sauce" }], note: "no onion" },
    { item_id: "b", name: "Frites au Cheddar Fondu et Oignons Frits", qty: 1 },
  ];
  const out = ticketItems(lines, new Map([["b", "FRITES CHEDDAR"]]));
  assert.deepEqual(out.map((i) => [i.name, i.variant ?? null, i.qty]), [["Panier Gajak 12pc", "Mixte", 2], ["FRITES CHEDDAR", null, 1]]);
  assert.deepEqual(out[0].mods, ["Extra sauce"]);
  assert.equal(out[0].note, "no onion");
});
