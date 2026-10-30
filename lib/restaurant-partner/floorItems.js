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
