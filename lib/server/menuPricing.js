const MAX_LINES = 100;
const MAX_QTY = 999;
const MAX_MODIFIERS = 20;

const toCents = (value) => Math.round(Number(value) * 100);
export const fromCents = (cents) => Number((cents / 100).toFixed(2));

function parseMenu(menuJson) {
  if (typeof menuJson !== "string") return menuJson;
  try {
    return JSON.parse(menuJson);
  } catch {
    return null;
  }
}

function validCents(value) {
  const cents = toCents(value);
  return Number.isFinite(cents) && cents >= 0 && cents <= 100_000_000 ? cents : null;
}

export function menuIndex(menuJson) {
  const menu = parseMenu(menuJson);
  const index = new Map();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const cents = validCents(item?.price);
      if (!item?.id || item.is_available === false || cents === null) continue;
      const modifiers = new Map();
      for (const mod of Array.isArray(item.modifiers) ? item.modifiers : []) {
        const modCents = validCents(mod?.price ?? 0);
        if (!mod?.id || mod.is_available === false || modCents === null) continue;
        modifiers.set(String(mod.id), { id: String(mod.id), name: String(mod.name || "").slice(0, 80), cents: modCents });
      }
      index.set(String(item.id), { name: String(item.name || "Item").slice(0, 120), cents, modifiers });
    }
  }
  return index;
}

export function priceLines(rawItems, index) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_LINES) return null;
  const lines = [];
  let subtotalCents = 0;
  for (const raw of rawItems) {
    const menuItem = index.get(String(raw?.item_id || ""));
    const qty = Number(raw?.quantity);
    if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;

    const rawMods = raw?.modifiers == null ? [] : raw.modifiers;
    if (!Array.isArray(rawMods) || rawMods.length > MAX_MODIFIERS) return null;
    const modifiers = [];
    let unitCents = menuItem.cents;
    for (const modId of rawMods) {
      const mod = menuItem.modifiers.get(String(modId?.id ?? modId));
      if (!mod) return null;
      modifiers.push({ id: mod.id, name: mod.name, price: fromCents(mod.cents) });
      unitCents += mod.cents;
    }

    const lineCents = unitCents * qty;
    subtotalCents += lineCents;
    lines.push({
      item_id: String(raw.item_id),
      name: menuItem.name,
      qty,
      unit_price: fromCents(unitCents),
      line_total: fromCents(lineCents),
      ...(modifiers.length ? { modifiers } : {}),
    });
  }
  return { lines, subtotalCents };
}
