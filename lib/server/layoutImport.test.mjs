import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cleanLayout, contactSheet, preparePlan } from "./layoutImport.js";

test("boxes from the AI become board-safe tables and features, with the close-up labels winning", () => {
  const out = cleanLayout(
    {
      is_floor_plan: true,
      tables: [
        { box: [10, 20, 14, 26], label: "1 2", shape: "circle", seats: 4 },
        { box: [99, 99, 120, 130], label: null, shape: "rectangle", seats: 0 },
        { box: [1, 1, 2, 2], label: "x", shape: "hexagon", seats: 4 },
      ],
      items: [
        { kind: "pool", box: [70, 60, 30, 40] },
        { kind: "sofa", box: [0, 0, 1, 1] },
      ],
    },
    new Map([[0, "12"]])
  );
  assert.deepEqual(out.tables, [
    { label: "12", shape: "circle", seats: 4, x: 12, y: 23 },
    { label: null, shape: "rectangle", seats: 1, x: 97, y: 96 },
  ]);
  assert.deepEqual(out.items, [{ kind: "pool", x: 50, y: 50, w: 40, h: 20, rotation: 0 }]);
  assert.equal(cleanLayout({ is_floor_plan: false, tables: [], items: [] }).is_floor_plan, false);
});

test("the plan gets a grid and table close-ups are cut out into one sheet", async () => {
  const src = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const { plain, gridded, width, height } = await preparePlan(src);
  assert.deepEqual([width, height], [1800, 1200]);
  assert.ok(gridded.length > 1000);
  const sheet = await contactSheet(plain, width, height, [[10, 10, 15, 15], [80, 80, 90, 95], [0, 0, 100, 100]]);
  const meta = await sharp(sheet).metadata();
  assert.deepEqual([meta.width, meta.height], [6 * 260, 294]);
});

test("tables snap to the exact drawn outline, ignoring text inside other shapes", async () => {
  const { snapTables } = await import("./layoutImport.js");
  const shapes = [
    { x_min: 10, y_min: 5, x_max: 35, y_max: 12, fill: 0.1 },
    { x_min: 18, y_min: 7, x_max: 20, y_max: 10, fill: 0.4 },
    { x_min: 25, y_min: 21, x_max: 30, y_max: 27, fill: 0.2 },
    { x_min: 26.5, y_min: 23, x_max: 28.5, y_max: 25, fill: 0.4 },
    { x_min: 60, y_min: 60, x_max: 65, y_max: 66, fill: 0.2 },
  ];
  const found = [
    { box: { x_min: 17, y_min: 6, x_max: 21, y_max: 11 }, shape: "circle", seats: 4, label: "T1" },
    { box: { x_min: 45, y_min: 55, x_max: 50, y_max: 61 }, shape: "circle", seats: 4, label: "T2" },
  ];
  const out = snapTables(found, shapes);
  assert.deepEqual(out.map((t) => [t.box.x_min, t.box.y_min]), [[25, 21], [60, 60]]);
});

test("a number read on two tables falls back to the other reading when that one is free", async () => {
  const { reconcileLabels } = await import("./layoutImport.js");
  const out = reconcileLabels(new Map([[0, "T16"], [1, "T16"], [2, "T17"], [3, null]]), ["T16", "T18", "T17", "T19"]);
  assert.deepEqual([...out.values()], ["T16", "T18", "T17", "T19"]);
});

test("tables the AI missed are added from the drawing, and invented ones are dropped", async () => {
  const { snapTables } = await import("./layoutImport.js");
  const ring = (x, y) => ({ x_min: x, y_min: y, x_max: x + 4, y_max: y + 6, fill: 0.2 });
  const shapes = [ring(10, 10), ring(20, 10), ring(30, 10), ring(40, 10), ring(50, 10)];
  const ai = (x, y, label) => ({ box: { x_min: x, y_min: y, x_max: x + 4, y_max: y + 6 }, shape: "circle", seats: 4, label });
  const out = snapTables([ai(10, 10, "T1"), ai(20, 10, "T2"), ai(30, 10, "T3"), ai(50, 10, "T5"), ai(80, 80, "T9")], shapes);
  assert.deepEqual(out.map((t) => [t.label, t.box.x_min]).sort((a, b) => a[1] - b[1]), [["T1", 10], ["T2", 20], ["T3", 30], [null, 40], ["T5", 50]]);
});
