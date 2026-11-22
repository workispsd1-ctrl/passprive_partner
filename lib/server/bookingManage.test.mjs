import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingTableNo, coverPatch, findClash } from "./bookingManage.js";

test("table number comes from the column first, then the old note", () => {
  assert.equal(bookingTableNo({ table_no: 4, notes_internal: "[table_no:2]" }), 4);
  assert.equal(bookingTableNo({ table_no: null, notes_internal: "VIP [table_no:2]" }), 2);
  assert.equal(bookingTableNo({}), null);
});

test("a table clashes only with an active booking on the same day that overlaps in time", () => {
  const me = { id: "a", booking_date: "2026-11-22", booking_time: "19:00", duration_minutes: 90 };
  const others = [
    { id: "b", booking_date: "2026-11-22", booking_time: "20:00", status: "confirmed", table_no: 4, customer_name: "Raj" },
    { id: "c", booking_date: "2026-11-22", booking_time: "20:00", status: "cancelled", table_no: 5 },
    { id: "d", booking_date: "2026-11-22", booking_time: "21:00", status: "confirmed", table_no: 6 },
    { id: "e", booking_date: "2026-11-23", booking_time: "19:00", status: "confirmed", table_no: 7 },
  ];
  assert.equal(findClash(me, others, 4)?.customer_name, "Raj");
  assert.equal(findClash(me, others, 5), null);
  assert.equal(findClash(me, others, 6), null);
  assert.equal(findClash(me, others, 7), null);
});

test("cover charge: paid needs a method; unpaid keeps the amount but records no payment", () => {
  assert.deepEqual(coverPatch({ amount: 500, paid: true, method: "cash", reference: " R1 " }).patch, {
    cover_charge_amount: 500,
    payment_status: "paid",
    payment_amount: 500,
    payment_method: "CASH",
    payment_reference: "R1",
  });
  assert.equal(coverPatch({ amount: 500, paid: false }).patch.payment_amount, 0);
  assert.equal(coverPatch({ amount: 500, paid: false }).patch.cover_charge_amount, 500);
  assert.match(coverPatch({ amount: 500, paid: true }).error, /how the cover charge was paid/);
  assert.match(coverPatch({ amount: -1 }).error, /between 0/);
});
