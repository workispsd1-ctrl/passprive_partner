import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { menuIndex, mergeLines, priceLines } = await import("./menuPricing.js");
const { payBillPart } = await import("./splitBill.js");
const { mergeBills } = await import("./changeTable.js");

const index = menuIndex({ sections: [{ id: "s", items: [{ id: "beer", name: "Beer", price: 150 }, { id: "burger", name: "Burger", price: 390 }] }] });
const guests = [{ id: "raj1", name: "Raj" }, { id: "ali1", name: "Ali" }];

function fakeDb(row) {
  const db = { row: structuredClone(row) };
  db.from = (table) => {
    const q = { filters: {}, patch: null };
    const chain = {
      select: () => chain,
      eq: (k, v) => ((q.filters[k] = v), chain),
      in: () => chain,
      order: () => chain,
      not: () => chain,
      limit: () => chain,
      update: (patch) => ((q.patch = patch), chain),
      maybeSingle: async () => ({ data: table === "offer_redemptions" ? null : structuredClone(db.row), error: null }),
      then: (resolve) => {
        if (table !== "restaurant_table_bookings") return resolve({ data: [], error: null });
        if (q.patch && q.filters.updated_at === db.row.updated_at) {
          db.row = { ...db.row, ...structuredClone(q.patch), updated_at: `${db.row.updated_at}+` };
          return resolve({ data: [{ id: db.row.id }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  };
  return db;
}

test("the same item for two guests stays on two lines; unknown guest counts as the table", () => {
  const out = priceLines(
    [
      { item_id: "beer", quantity: 1, guest_id: "raj1" },
      { item_id: "beer", quantity: 1, guest_id: "ali1" },
      { item_id: "beer", quantity: 1, guest_id: "nobody" },
    ],
    index,
    { guests },
  );
  assert.equal(out.lines.length, 3);
  assert.deepEqual(out.lines.map((l) => l.guest || null), ["Raj", "Ali", null]);
  assert.equal(mergeLines(out.lines, out.lines).length, 3);
  assert.equal(priceLines([{ item_id: "beer", quantity: 1, guest_id: "raj1" }], index).lines[0].guest_id, undefined);
});

test("pay for one guest charges only their lines, then the rest closes the bill", async () => {
  const lines = priceLines(
    [
      { item_id: "burger", quantity: 1, guest_id: "raj1" },
      { item_id: "beer", quantity: 1, guest_id: "raj1" },
      { item_id: "beer", quantity: 2, guest_id: "ali1" },
      { item_id: "burger", quantity: 1 },
    ],
    index,
    { guests },
  ).lines;
  const db = fakeDb({
    id: "o1",
    total_amount: 1230,
    tip_amount: 0,
    payment_status: "PENDING",
    booking_status: "PREPARING",
    updated_at: "t0",
    order_details: { guests },
    order_items: lines,
  });
  const pay = (body) => payBillPart(db, "r1", "u1", { order_id: "o1", method: "CASH", ...body });

  let r = await pay({ idempotency_key: "k1", guest_id: "raj1" });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.part.amount, 540);
  assert.equal(r.body.part.guest, "Raj");
  assert.equal(r.body.remaining, 690);
  assert.equal(db.row.payment_status, "PENDING");

  r = await pay({ idempotency_key: "k2", guest_id: "raj1" });
  assert.equal(r.body.ok, false);
  assert.match(r.body.error, /Nothing is left to pay for Raj/);

  r = await pay({ idempotency_key: "k3", guest_id: "ghost" });
  assert.equal(r.status, 404);

  r = await pay({ idempotency_key: "k4", rest: true });
  assert.equal(r.body.closed, true);
  assert.equal(r.body.part.amount, 690);
  assert.equal(r.body.part.guest, undefined);
  assert.equal(db.row.payment_status, "PAID");
});

test("merging two tables keeps both guest lists", () => {
  const target = { id: "t", table_no: 1, order_items: [], order_details: { guests: [guests[0]] } };
  const source = { id: "s", table_no: 2, order_items: [], order_details: { guests: [guests[1]] } };
  const merged = mergeBills(target, source, "u1", "now");
  assert.deepEqual(merged.order_details.guests.map((g) => g.name), ["Raj", "Ali"]);
});

test("cancelling a guest picks exactly that guest's lines, all units", async () => {
  const { guestLines } = await import("./billItems.js");
  const items = [
    { line_key: "a||", qty: 2 },
    { line_key: "b|||@g1", qty: 1, guest_id: "g1" },
    { line_key: "c|||@g1", qty: 3, guest_id: "g1" },
    { line_key: "d|||@g2", qty: 1, guest_id: "g2" },
  ];
  assert.deepEqual(guestLines(items, "g1"), [{ item_key: "b|||@g1", qty: 1 }, { item_key: "c|||@g1", qty: 3 }]);
  assert.deepEqual(guestLines(items, "g9"), []);
});

test("renaming a guest updates the name on their dishes and keeps the line keys", async () => {
  const { renameGuestLines } = await import("./billGuests.js");
  const items = [
    { name: "Beer", qty: 1, guest_id: "g1", guest: "Ann", line_key: "b|||@g1" },
    { name: "Coke", qty: 2, line_key: "c||" },
  ];
  const out = renameGuestLines(items, "g1", "Anna");
  assert.deepEqual(out.map((i) => [i.guest ?? null, i.line_key]), [["Anna", "b|||@g1"], [null, "c||"]]);
});
