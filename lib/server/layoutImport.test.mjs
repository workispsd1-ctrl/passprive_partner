import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLayout } from "./layoutImport.js";

test("AI floor-plan answers are cleaned into board-safe tables and items", () => {
  const out = cleanLayout({
    is_floor_plan: true,
    tables: [
      { label: " 12 ", shape: "circle", seats: 4, x: 150, y: -5 },
      { label: "", shape: "rectangle", seats: 0, x: 40.123, y: 50 },
      { label: "x", shape: "hexagon", seats: 4, x: 10, y: 10 },
    ],
    items: [{ kind: "pool", x: 50, y: 50, w: 140, h: 20, rotation: 45 }, { kind: "sofa", x: 1, y: 1, w: 1, h: 1, rotation: 0 }],
  });
  assert.deepEqual(out.tables, [
    { label: "12", shape: "circle", seats: 4, x: 97, y: 4 },
    { label: null, shape: "rectangle", seats: 1, x: 40.1, y: 50 },
  ]);
  assert.deepEqual(out.items, [{ kind: "pool", x: 50, y: 50, w: 100, h: 20, rotation: 0 }]);
  assert.equal(cleanLayout({ is_floor_plan: false, tables: [], items: [] }).is_floor_plan, false);
});
