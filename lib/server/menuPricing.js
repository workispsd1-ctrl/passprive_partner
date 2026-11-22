import { isSoldOut, mauritiusToday } from "../soldOut.js";
import { menuAreas, sectionPlace } from "../menuAreas.js";

const MAX_LINES = 100;
const MAX_QTY = 999;
const MAX_OPTIONS = 30;
export const MAX_NOTE = 140;

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

export function cleanNote(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE);
}

export const MAX_PICKS = 10;

export function variantPicks(variant) {
  const n = Number.parseInt(variant?.picks, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_PICKS) : 0;
}

function groupRules(group, optionCount) {
  const min = Math.max(0, Math.min(Number.parseInt(group?.min, 10) || 0, optionCount));
  const rawMax = Number.parseInt(group?.max, 10);
  const max = Number.isInteger(rawMax) && rawMax > 0 ? Math.max(min, Math.min(rawMax, optionCount)) : optionCount;
  return { min, max };
}

export function menuIndex(menuJson) {
  const menu = parseMenu(menuJson);
  const index = new Map();
  const areas = menuAreas(menu);
  const today = mauritiusToday();
  for (const section of Array.isArray(menu?.sections) ? menu.sections : []) {
    const station = sectionPlace(areas, section).kind === "Bar" ? "bar" : "kitchen";
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      if (!item?.id || item.is_available === false || isSoldOut(item, today)) continue;
      const declaredVariants = (Array.isArray(item.variants) ? item.variants : []).filter((v) => v?.id);
      const variants = new Map();
      for (const v of declaredVariants) {
        const vCents = validCents(v.price);
        if (v.is_available === false || vCents === null) continue;
        variants.set(String(v.id), { id: String(v.id), name: String(v.name || "").slice(0, 120), cents: vCents, picks: variantPicks(v) });
      }
      if (declaredVariants.length && !variants.size) continue;
      const cents = declaredVariants.length ? 0 : validCents(item?.price);
      if (cents === null) continue;
      const options = new Map();
      const groups = [];
      for (const group of Array.isArray(item.modifier_groups) ? item.modifier_groups : []) {
        if (!group?.id) continue;
        const groupOptions = [];
        for (const opt of Array.isArray(group.options) ? group.options : []) {
          const optCents = validCents(opt?.price ?? 0);
          if (!opt?.id || opt.is_available === false || optCents === null) continue;
          const entry = {
            id: String(opt.id),
            name: String(opt.name || "").slice(0, 80),
            cents: optCents,
            groupId: String(group.id),
            groupName: String(group.name || "").slice(0, 80),
          };
          options.set(entry.id, entry);
          groupOptions.push(entry.id);
        }
        const declared = (Array.isArray(group.options) ? group.options : []).filter((o) => o?.id).length;
        const { min, max } = groupRules(group, declared);
        groups.push({ id: String(group.id), name: String(group.name || "").slice(0, 80), min, max, perPick: group.per_pick === true, optionIds: groupOptions });
      }
      index.set(String(item.id), { name: String(item.name || "Item").slice(0, 120), cents, variants, options, groups, station });
    }
  }
  return index;
}

export function lineKey(line) {
  const ids = (Array.isArray(line?.modifiers) ? line.modifiers : [])
    .flatMap((m) => Array(Math.max(1, Number.parseInt(m?.qty, 10) || 1)).fill(String(m?.id ?? m)))
    .sort();
  const variant = line?.variant_id ?? line?.variant?.id;
  const base = String(line?.item_id || line?.name || "") + (variant ? `~${variant}` : "");
  const key = [base, ids.join(","), cleanNote(line?.note).toLowerCase()].join("|");
  return line?.guest_id ? `${key}|@${line.guest_id}` : key;
}

export function priceLines(rawItems, index, { maxQty = MAX_QTY, guests = [] } = {}) {
  const guestById = new Map((Array.isArray(guests) ? guests : []).map((g) => [String(g.id), g]));
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_LINES) return null;
  const byKey = new Map();
  let subtotalCents = 0;
  for (const raw of rawItems) {
    const itemId = String(raw?.item_id ?? raw?.id ?? "");
    const menuItem = index.get(itemId);
    const qty = Number(raw?.quantity ?? raw?.qty);
    if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > maxQty) return null;
    let variant = null;
    if (menuItem.variants.size) {
      variant = menuItem.variants.get(String(raw?.variant_id ?? raw?.variant?.id ?? ""));
      if (!variant) return null;
    } else if (raw?.variant_id) {
      return null;
    }

    const rawMods = raw?.modifiers == null ? [] : raw.modifiers;
    if (!Array.isArray(rawMods) || rawMods.length > MAX_OPTIONS) return null;
    const slotGroups = new Set(menuItem.groups.filter((g) => g.perPick && variant?.picks).map((g) => g.id));
    const seen = new Set();
    const picked = [];
    for (const optId of rawMods.map((m) => String(m?.id ?? m))) {
      const opt = menuItem.options.get(optId);
      if (!opt) return null;
      if (!slotGroups.has(opt.groupId)) {
        if (seen.has(optId)) continue;
        seen.add(optId);
      }
      picked.push(opt);
    }
    for (const group of menuItem.groups) {
      const count = picked.filter((o) => o.groupId === group.id).length;
      if (slotGroups.has(group.id) ? count !== variant.picks : count < group.min || count > group.max) return null;
    }

    const order = new Map(menuItem.groups.flatMap((g, gi) => g.optionIds.map((id, oi) => [id, gi * 1000 + oi])));
    picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const unitCents = picked.reduce((sum, o) => sum + o.cents, variant ? variant.cents : menuItem.cents);
    const note = cleanNote(raw?.note);
    const counts = new Map();
    for (const o of picked) counts.set(o.id, (counts.get(o.id) || 0) + 1);
    const modifiers = [...new Map(picked.map((o) => [o.id, o])).values()].map((o) => {
      const n = counts.get(o.id);
      return {
        group_id: o.groupId,
        group: o.groupName,
        id: o.id,
        name: n > 1 ? `${n}× ${o.name}` : o.name,
        price: fromCents(o.cents * n),
        ...(n > 1 ? { qty: n } : {}),
      };
    });
    const line = {
      item_id: itemId,
      name: variant ? `${menuItem.name} – ${variant.name}`.slice(0, 200) : menuItem.name,
      ...(variant ? { variant: { id: variant.id, name: variant.name } } : {}),
      qty,
      unit_price: fromCents(unitCents),
      line_total: fromCents(unitCents * qty),
      station: menuItem.station || "kitchen",
      ...(modifiers.length ? { modifiers } : {}),
      ...(note ? { note } : {}),
    };
    const guest = guestById.get(String(raw?.guest_id ?? ""));
    if (guest) {
      line.guest_id = String(guest.id);
      line.guest = String(guest.name || "");
    }
    line.line_key = lineKey(line);
    subtotalCents += unitCents * qty;

    const prev = byKey.get(line.line_key);
    if (prev) {
      prev.qty += qty;
      prev.line_total = fromCents(toCents(prev.unit_price) * prev.qty);
    } else {
      byKey.set(line.line_key, line);
    }
  }
  return { lines: [...byKey.values()], subtotalCents };
}

export function mergeLines(existing, incoming) {
  const merged = new Map();
  for (const line of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const key = line?.line_key || lineKey(line);
    if (!key.split("|")[0]) continue;
    const qty = Number(line?.qty || 0);
    const prev = merged.get(key);
    const unit = prev ? prev.unit_price : Number(line?.unit_price || 0);
    const nextQty = (prev?.qty || 0) + qty;
    merged.set(key, { ...(prev || line), line_key: key, qty: nextQty, line_total: fromCents(toCents(unit) * nextQty) });
  }
  return [...merged.values()];
}

export function findLine(items, key) {
  const k = String(key || "").trim();
  if (!k) return -1;
  const exact = items.findIndex((it) => (it.line_key || lineKey(it)) === k);
  if (exact >= 0) return exact;
  const lower = k.toLowerCase();
  return items.findIndex((it) => String(it.item_id || it.name || "").toLowerCase() === lower);
}

export function publicModifierGroups(item) {
  return (Array.isArray(item?.modifier_groups) ? item.modifier_groups : [])
    .filter((g) => g?.id)
    .map((g) => {
      const declared = (Array.isArray(g.options) ? g.options : []).filter((o) => o?.id);
      const { min, max } = groupRules(g, declared.length);
      const options = declared
        .filter((o) => o.is_available !== false && validCents(o.price ?? 0) !== null)
        .map((o) => ({ id: String(o.id), name: String(o.name || "").slice(0, 80), price: fromCents(validCents(o.price ?? 0)) }));
      return { id: String(g.id), name: String(g.name || "").slice(0, 80), min, max, per_pick: g.per_pick === true, options };
    })
    .filter((g) => g.options.length > 0 || g.min > 0);
}

export function publicVariants(item) {
  return (Array.isArray(item?.variants) ? item.variants : [])
    .filter((v) => v?.id && v.is_available !== false && validCents(v.price) !== null)
    .map((v) => ({
      id: String(v.id),
      name: String(v.name || "").slice(0, 120),
      description: v.description ? String(v.description).slice(0, 200) : null,
      price: fromCents(validCents(v.price)),
      is_veg: v.is_veg === true,
      picks: variantPicks(v),
    }));
}

export function publicSubcategories(section) {
  return (Array.isArray(section?.subcategories) ? section.subcategories : [])
    .filter((c) => c?.id && String(c.name || "").trim())
    .map((c) => ({ id: String(c.id), name: String(c.name).trim().slice(0, 60) }));
}
