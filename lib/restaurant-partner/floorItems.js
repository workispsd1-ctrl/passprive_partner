export const FLOOR_ITEMS = [
  { kind: "pool", label: "Pool", shape: "rect", w: 30, h: 16 },
  { kind: "bar", label: "Bar counter", shape: "rect", w: 30, h: 7 },
  { kind: "wall", label: "Wall", shape: "rect", w: 30, h: 1.5 },
  { kind: "stage", label: "Stage", shape: "rect", w: 28, h: 14 },
  { kind: "entrance", label: "Entrance", shape: "rect", w: 14, h: 6 },
  { kind: "plant", label: "Plant", shape: "round", w: 6, h: 6 },
];

export function floorItemMeta(kind) {
  return FLOOR_ITEMS.find((i) => i.kind === kind) || FLOOR_ITEMS[0];
}

const SNAP_DISTANCE = 1.6;

function box(item, x, y) {
  const quarter = ((item.rotation || 0) % 360) / 90;
  if (!Number.isInteger(quarter)) return null;
  const sideways = quarter % 2 !== 0;
  const halfW = ((sideways ? item.h : item.w) * 1.6) / 2;
  const halfH = ((sideways ? item.w : item.h) * 1.6) / 2;
  const cx = x * 1.6;
  return { left: cx - halfW, centerX: cx, right: cx + halfW, top: y - halfH, centerY: y, bottom: y + halfH };
}

function nearest(mine, theirs) {
  let best = null;
  for (const a of mine) {
    for (const b of theirs) {
      const delta = b - a;
      if (Math.abs(delta) <= SNAP_DISTANCE && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
    }
  }
  return best ?? 0;
}

export function snapPosition(item, x, y, others) {
  const me = box(item, x, y);
  if (!me) return { x, y };
  const boxes = others.map((o) => box(o, o.x, o.y)).filter(Boolean);
  const xs = boxes.flatMap((b) => [b.left, b.centerX, b.right]);
  const ys = boxes.flatMap((b) => [b.top, b.centerY, b.bottom]);
  return {
    x: x + nearest([me.left, me.centerX, me.right], xs) / 1.6,
    y: y + nearest([me.top, me.centerY, me.bottom], ys),
  };
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.5;
const two = (n) => Math.round(n * 100) / 100;

export function zoomFloor(tables, items, scale, factor) {
  const nextScale = two(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor)));
  if (nextScale === scale) return { limit: true };
  const f = nextScale / scale;
  const move = (v) => two(50 + (v - 50) * f);
  const nextTables = tables.map((t) => ({ ...t, pos_x: move(t.pos_x), pos_y: move(t.pos_y) }));
  const nextItems = items.map((i) => ({ ...i, x: move(i.x), y: move(i.y), w: two(i.w * f), h: two(i.h * f) }));
  const fits =
    nextTables.every((t) => t.pos_x >= 3 && t.pos_x <= 97 && t.pos_y >= 4 && t.pos_y <= 96) &&
    nextItems.every((i) => i.x >= 0 && i.x <= 100 && i.y >= 0 && i.y <= 100);
  if (!fits) return { noRoom: true };
  return { scale: nextScale, tables: nextTables, items: nextItems };
}
