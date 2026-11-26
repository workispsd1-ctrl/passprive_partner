import { test } from "node:test";
import assert from "node:assert/strict";
import { menuAreas, menuTabs, sectionPlace, sectionTab } from "./menuAreas.js";

test("existing menus fall under Interior Kitchen; bar-ish groups go to Bar", () => {
  const areas = menuAreas({});
  assert.deepEqual(areas.map((a) => a.id), ["interior"]);
  assert.deepEqual(sectionPlace(areas, { group: null }), { areaId: "interior", kind: "Kitchen" });
  assert.deepEqual(sectionPlace(areas, { group: "Drinks" }), { areaId: "interior", kind: "Bar" });
  assert.deepEqual(menuTabs(areas).map((t) => t.label), ["Kitchen", "Bar"]);
});

test("areas with only one menu send sections there and label tabs with the area", () => {
  const areas = menuAreas({ menu_areas: [{ id: "i", name: "Interior", menus: ["Kitchen", "Bar"] }, { id: "p", name: "PUB", menus: ["Bar"] }] });
  assert.equal(sectionTab(areas, { menu_area_id: "p", group: "Kitchen" }), "p:Bar");
  assert.equal(sectionTab(areas, { menu_area_id: "gone", group: "Bar" }), "i:Bar");
  assert.deepEqual(menuTabs(areas).map((t) => t.label), ["Interior · Kitchen", "Interior · Bar", "PUB · Bar"]);
});

test("a venue only sees its own menu sections", async () => {
  const { menuForArea } = await import("./menuAreas.js");
  const menu = {
    menu_areas: [{ id: "interior", name: "COCOCHILL", menus: ["Kitchen", "Bar"] }, { id: "xo", name: "XO", menus: ["Kitchen", "Bar"] }],
    sections: [{ id: "a", items: [] }, { id: "b", menu_area_id: "xo", items: [] }, { id: "c", menu_area_id: "interior", items: [] }],
  };
  assert.deepEqual(menuForArea(menu, "xo").sections.map((s) => s.id), ["b"]);
  assert.deepEqual(menuForArea(menu, "interior").sections.map((s) => s.id), ["a", "c"]);
  assert.equal(menuForArea(menu, null), menu);
  assert.equal(menuForArea(menu, "nope"), menu);
});

test("a venue covers every table area linked to its menu", async () => {
  const { venueOf } = await import("./server/tillArea.js");
  const rows = [{ id: "coco", menu_area_id: "interior" }, { id: "bar", menu_area_id: "interior" }, { id: "xo", menu_area_id: "xo" }, { id: "free", menu_area_id: null }];
  assert.deepEqual([...venueOf(rows, "coco").ids].sort(), ["bar", "coco"]);
  assert.deepEqual([...venueOf(rows, "xo").ids], ["xo"]);
  assert.deepEqual([...venueOf(rows, "free").ids], ["free"]);
});
