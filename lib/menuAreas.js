export const MENU_KINDS = ["Kitchen", "Bar"];
export const DEFAULT_MENU_AREAS = [{ id: "interior", name: "Interior", menus: ["Kitchen", "Bar"] }];

const isBar = (group) => /bar|drink|beverage|boisson/i.test(String(group || ""));

export function menuAreas(menu) {
  const list = (Array.isArray(menu?.menu_areas) ? menu.menu_areas : [])
    .filter((a) => a && a.id && String(a.name || "").trim())
    .map((a) => ({
      id: String(a.id),
      name: String(a.name).trim().slice(0, 40),
      menus: MENU_KINDS.filter((k) => (Array.isArray(a.menus) ? a.menus : MENU_KINDS).includes(k)),
    }))
    .filter((a) => a.menus.length);
  return list.length ? list : DEFAULT_MENU_AREAS;
}

export function sectionPlace(areas, section) {
  const area = areas.find((a) => a.id === section?.menu_area_id) || areas[0];
  const wanted = isBar(section?.group) ? "Bar" : "Kitchen";
  const kind = area.menus.includes(wanted) ? wanted : area.menus[0];
  return { areaId: area.id, kind };
}

export function menuTabs(areas) {
  const single = areas.length === 1;
  return areas.flatMap((a) =>
    a.menus.map((k) => ({ key: `${a.id}:${k}`, label: single ? k : `${a.name} · ${k}` }))
  );
}

export function sectionTab(areas, section) {
  const { areaId, kind } = sectionPlace(areas, section);
  return `${areaId}:${kind}`;
}

export function menuForArea(menu, menuAreaId) {
  if (!menuAreaId || !menu || typeof menu !== "object") return menu;
  const areas = menuAreas(menu);
  if (!areas.some((a) => a.id === menuAreaId)) return menu;
  const sections = Array.isArray(menu.sections) ? menu.sections : [];
  return {
    ...menu,
    menu_areas: areas.filter((a) => a.id === menuAreaId),
    sections: sections.filter((s) => sectionPlace(areas, s).areaId === menuAreaId),
  };
}
