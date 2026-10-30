"use client";

import { floorItemMeta } from "@/lib/restaurant-partner/floorItems";

const VIEW_W = 160;
const VIEW_H = 100;

const isPool = (item) => !item.kind || item.kind === "pool";

function transformOf(item) {
  return `translate(${item.x * 1.6} ${item.y}) rotate(${item.rotation || 0})`;
}

function ItemShape({ item, ...props }) {
  const w = item.w * 1.6;
  const h = item.h * 1.6;
  const transform = transformOf(item);
  if (item.shape === "round") return <ellipse transform={transform} rx={w / 2} ry={h / 2} {...props} />;
  if (item.shape === "triangle") {
    return <polygon transform={transform} points={`0,${-h / 2} ${w / 2},${h / 2} ${-w / 2},${h / 2}`} {...props} />;
  }
  return <rect transform={transform} x={-w / 2} y={-h / 2} width={w} height={h} rx={isPool(item) ? 1.5 : 0.6} {...props} />;
}

function Label({ text, width, color }) {
  const size = Math.min(3.2, width / (text.length * 0.8));
  return (
    <text y={size * 0.36} textAnchor="middle" fontSize={size} fontWeight={700} letterSpacing={0.2} fill={color}>
      {text}
    </text>
  );
}

function Decor({ item }) {
  const w = item.w * 1.6;
  const h = item.h * 1.6;
  const rect = { x: -w / 2, y: -h / 2, width: w, height: h };
  const inset = (n) => ({ x: -w / 2 + n, y: -h / 2 + n, width: Math.max(0, w - n * 2), height: Math.max(0, h - n * 2) });
  const name = floorItemMeta(item.kind).label.split(" ")[0].toUpperCase();

  if (item.kind === "wall") return <rect {...rect} rx={0.2} fill="#3F3F46" />;
  if (item.kind === "plant") {
    return (
      <>
        <ellipse rx={w / 2} ry={h / 2} fill="#2F7F47" />
        <ellipse cx={-w * 0.14} cy={-h * 0.1} rx={w * 0.3} ry={h * 0.3} fill="#4CAF6B" />
        <ellipse cx={w * 0.17} cy={h * 0.13} rx={w * 0.22} ry={h * 0.22} fill="#4CAF6B" />
        <ellipse cx={-w * 0.05} cy={-h * 0.17} rx={w * 0.12} ry={h * 0.12} fill="#86D69B" />
      </>
    );
  }
  if (item.kind === "bar") {
    return (
      <>
        <rect {...rect} rx={0.8} fill="#5C3A20" />
        <rect {...inset(0.7)} rx={0.5} fill="#8A5A36" />
        <Label text={name} width={w} color="#FFF3E2" />
      </>
    );
  }
  if (item.kind === "stage") {
    return (
      <>
        <rect {...rect} rx={1} fill="#2B2733" />
        <rect {...inset(0.9)} rx={0.6} fill="none" stroke="#FFB547" strokeWidth={0.3} />
        <Label text={name} width={w} color="#FFFFFF" />
      </>
    );
  }
  return (
    <>
      <rect {...rect} rx={0.8} fill="#FFF1EB" stroke="#FF4800" strokeWidth={0.45} strokeDasharray="1.6 1" />
      <Label text={name} width={w} color="#E84A00" />
    </>
  );
}

export default function FloorItems({ items, selectedId, onPointerDown, onSelect }) {
  if (!items.length) return null;
  const pools = items.filter(isPool);
  const decor = items.filter((i) => !isPool(i));
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="poolWater" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VIEW_W} y2={VIEW_H}>
          <stop offset="0" stopColor="#7BE3F2" />
          <stop offset="0.45" stopColor="#22B2E2" />
          <stop offset="1" stopColor="#0A79BE" />
        </linearGradient>
        <pattern id="poolRipples" patternUnits="userSpaceOnUse" width="26" height="17">
          <path d="M1 4 q4 -2.2 8 -0.4 t9 0.2 q3 1 7 -0.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="0.28" strokeLinecap="round" />
          <path d="M-2 10 q5 1.8 9 0.2 t8 -0.5 q4 -1.2 12 0.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="0.24" strokeLinecap="round" />
          <path d="M6 14.5 q3 -1.2 6 -0.2 t6 0" fill="none" stroke="#E8FBFF" strokeOpacity="0.28" strokeWidth="0.22" strokeLinecap="round" />
          <path d="M16 7 q2 -0.9 4 0" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.2" strokeLinecap="round" />
        </pattern>
        <clipPath id="poolClip">
          {pools.map((p) => (
            <ItemShape key={`clip-${p.id}`} item={p} />
          ))}
        </clipPath>
      </defs>

      {pools.map((p) => (
        <ItemShape key={`deck-${p.id}`} item={p} fill="#B9AB93" stroke="#B9AB93" strokeWidth={3.6} strokeLinejoin="round" />
      ))}
      {pools.map((p) => (
        <ItemShape key={`coping-${p.id}`} item={p} fill="#EFE6D6" stroke="#EFE6D6" strokeWidth={2.8} strokeLinejoin="round" />
      ))}
      {pools.map((p) => (
        <ItemShape key={`rim-${p.id}`} item={p} fill="#0B7FBF" stroke="#0B7FBF" strokeWidth={0.5} strokeLinejoin="round" />
      ))}
      {pools.length ? (
        <>
          <rect width={VIEW_W} height={VIEW_H} fill="url(#poolWater)" clipPath="url(#poolClip)" />
          <rect width={VIEW_W} height={VIEW_H} fill="url(#poolRipples)" clipPath="url(#poolClip)" />
        </>
      ) : null}

      {decor.map((d) => (
        <g key={`decor-${d.id}`} transform={transformOf(d)}>
          <Decor item={d} />
        </g>
      ))}

      {items.map((i) => (
        <ItemShape
          key={`hit-${i.id}`}
          item={i}
          fill="transparent"
          className="pointer-events-auto touch-none"
          style={{ cursor: "grab" }}
          onPointerDown={(e) => onPointerDown(e, i)}
          onClick={() => onSelect(i.id)}
        />
      ))}
      {items
        .filter((i) => i.id === selectedId)
        .map((i) => (
          <ItemShape key={`sel-${i.id}`} item={i} fill="none" stroke="#FF4800" strokeWidth={0.9} strokeDasharray="2.4 1.6" strokeLinejoin="round" />
        ))}
    </svg>
  );
}
