import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith("@/") ? next(new URL(`${spec.slice(2)}.js`, root).href, ctx) : next(spec, ctx);
  },
});
const { visibleMoves } = await import("./guestMoves.js");

const now = Date.parse("2026-11-20T20:00:00Z");
const moves = [
  { id: "w", status: "waiting", from_area_id: "bar", updated_at: "2026-11-20T19:59:00Z" },
  { id: "stuck", status: "assigning", from_area_id: "bar", updated_at: "2026-11-20T19:50:00Z" },
  { id: "busy", status: "assigning", from_area_id: "bar", updated_at: "2026-11-20T19:59:30Z" },
  { id: "a", status: "assigned", from_area_id: "bar", updated_at: "2026-11-20T19:59:00Z" },
  { id: "s", status: "serve_here", from_area_id: "bar", updated_at: "2026-11-20T19:59:00Z" },
];

test("downstairs sees guests to seat (incl. stuck locks); the bar sees only its notices", () => {
  const down = visibleMoves(moves, "interior", "u-down", now);
  assert.deepEqual(down.toSeat.map((m) => m.id), ["w", "stuck"]);
  assert.deepEqual(down.notices, []);
  const up = visibleMoves(moves, "bar", "u-other", now);
  assert.deepEqual(up.toSeat, []);
  assert.deepEqual(up.notices.map((m) => m.id), ["a", "s"]);
  const main = visibleMoves(moves, null, "u-main", now);
  assert.equal(main.toSeat.length, 2);
  assert.equal(main.notices.length, 2);
});

test("a notice goes only to the waiter who placed the order", () => {
  const owned = [
    { id: "mine", status: "assigned", ordered_by: "u-bar1", from_area_id: "bar", updated_at: "2026-11-20T19:59:00Z" },
    { id: "qr", status: "assigned", ordered_by: null, from_area_id: "bar", updated_at: "2026-11-20T19:59:00Z" },
  ];
  assert.deepEqual(visibleMoves(owned, "bar", "u-bar1", now).notices.map((m) => m.id), ["mine", "qr"]);
  assert.deepEqual(visibleMoves(owned, "bar", "u-bar2", now).notices.map((m) => m.id), ["qr"]);
  assert.deepEqual(visibleMoves(owned, null, "u-main", now).notices.map((m) => m.id), ["qr"]);
  assert.deepEqual(visibleMoves(owned, "interior", "u-bar1", now).notices.map((m) => m.id), ["mine"]);
});
