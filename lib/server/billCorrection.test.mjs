import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { methodChange, reopenPatch } = await import("./billCorrection.js");
const who = { by: "u1", at: "2026-11-22T20:00:00Z", reason: "Wrong key" };

test("a cash payment typed by mistake becomes card, with an audit line", () => {
  const row = { payment_method: "CASH", order_details: { payment: { method: "CASH", amount_due: 1000, amount_received: 1500, change: 500, tip: 50, tip_method: "CASH", amount_charged: 1050 } } };
  const out = methodChange(row, { to: "CARD", ...who });
  const p = out.patch.order_details.payment;
  assert.deepEqual([out.patch.payment_method, p.method, p.tip_method, p.amount_received, p.change], ["CARD", "CARD", "CARD", 1050, 0]);
  assert.equal(out.patch.order_details.corrections[0].from, "CASH");
  assert.match(methodChange(row, { to: "CASH", ...who }).error, /already/);
  assert.match(methodChange(row, { to: "CARD", ...who, reason: "" }).error, /reason/);
});

test("terminal payments can't be relabelled; one split part changes and the rest stays", () => {
  const terminal = { payment_method: "CARD", order_details: { payment: { method: "CARD", gateway: { rrn: "123" } } } };
  assert.match(methodChange(terminal, { to: "CASH", ...who }).error, /terminal/);
  const parts = [
    { no: 1, method: "DEPOSIT", amount: 500 },
    { no: 2, method: "CASH", amount: 300, tip: 20, received: 400, change: 80 },
    { no: 3, method: "CARD", amount: 200, gateway: { rrn: "9" } },
  ];
  const row = { order_details: { payments: parts, payment: { method: "SPLIT", split: parts.map((p) => ({ method: p.method, amount: p.amount })) } } };
  assert.match(methodChange(row, { part: 0, to: "CASH", ...who }).error, /can't be changed/);
  assert.match(methodChange(row, { part: 2, to: "CASH", ...who }).error, /terminal/);
  const out = methodChange(row, { part: 1, to: "JUICE", ...who });
  const d = out.patch.order_details;
  assert.deepEqual([d.payments[1].method, d.payments[1].received, d.payments[1].change, d.payment.split[1].method, d.payment.method], ["JUICE", 320, 0, "JUICE", "SPLIT"]);
  assert.deepEqual(d.payment.tip_split, [{ method: "JUICE", amount: 20 }]);
});

test("reopening keeps the deposit, saves what was paid, and asks for a terminal refund first", () => {
  const row = { tip_amount: 20, payment_method: "SPLIT", order_details: { payments: [{ method: "DEPOSIT", amount: 500, no: 1 }, { method: "CASH", amount: 300, no: 2 }], payment: { method: "SPLIT" } } };
  const out = reopenPatch(row, who);
  assert.equal(out.patch.payment_status, "PENDING");
  assert.deepEqual(out.patch.order_details.payments.map((p) => p.method), ["DEPOSIT"]);
  assert.equal(out.patch.order_details.payment, undefined);
  assert.equal(out.patch.order_details.reopened[0].payments[0].method, "CASH");
  const card = { order_details: { payment: { method: "CARD", gateway: { rrn: "1" } } } };
  assert.equal(reopenPatch(card, who).error, "terminal_refund_needed");
  assert.equal(reopenPatch(card, { ...who, refunded: true }).patch.payment_status, "PENDING");
});
