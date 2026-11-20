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
