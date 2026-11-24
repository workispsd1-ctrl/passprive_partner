import sharp from "sharp";

export const ITEM_KINDS = ["pool", "bar", "wall", "stage", "entrance", "plant"];
const SHAPES = ["circle", "square", "rectangle"];
const MAX_TABLES = 80;
const MAX_ITEMS = 24;
const MODELS = ["gpt-4.1", "gpt-4o"];
const LONG_SIDE = 1800;

const BOX = {
  type: "object",
  additionalProperties: false,
  required: ["x_min", "y_min", "x_max", "y_max"],
  properties: { x_min: { type: "number" }, y_min: { type: "number" }, x_max: { type: "number" }, y_max: { type: "number" } },
};

const DETECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_floor_plan", "tables", "items"],
  properties: {
    is_floor_plan: { type: "boolean" },
    tables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["box", "shape", "seats", "label"],
        properties: {
          box: BOX,
          shape: { type: "string", enum: SHAPES },
          seats: { type: "integer" },
          label: { type: ["string", "null"] },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "box"],
        properties: { kind: { type: "string", enum: ITEM_KINDS }, box: BOX },
      },
    },
  },
};

const LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["labels"],
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "label", "seats"],
        properties: { index: { type: "integer" }, label: { type: ["string", "null"] }, seats: { type: "integer" } },
      },
    },
  },
};

const DETECT_PROMPT = `You map restaurant floor plans (architect plans, top-down drawings, hand sketches, often labelled in French or English).
The image has a red coordinate grid: lines every 10 units, numbered 0 to 100 along the top (x, left to right) and the left side (y, top to bottom). Use the grid to measure positions precisely.
For EVERY dining table return its bounding box (x_min, y_min, x_max, y_max) in grid units (0-100), its shape (circle, square or rectangle for long tables), the number of seats (count the chairs drawn around it; if none are drawn use 2 for small, 4 for normal, 6 or more for long tables) and the table number or name written on or next to it exactly as printed (e.g. "12", "T12", "VIP 2"), or null if none is written.
Also return every fixed feature with its bounding box:
- pool: swimming pool / piscine / bassin, usually a large blue or water-patterned area, wavy lines, or labelled POOL / PISCINE. Always include it if present.
- bar: bar counter / comptoir / bar.
- wall: walls and solid partitions (thin long boxes).
- stage: stage / scène / DJ.
- entrance: doors, entrance / entrée / sortie.
- plant: plants, trees, planters / plantes.
Do not count chairs, sunbeds, umbrellas or decorations as tables. Do not miss any table: scan the whole image row by row.
If the image is not a floor plan, set is_floor_plan to false and return empty lists.`;

const LABEL_PROMPT = `Each numbered square shows one restaurant table cut out of a floor plan. The red number under each square is its index.
For each index, read the table number or name written on or right next to the table in the middle of that square, exactly as printed (digits and letters only, e.g. "12", "T12", "B3"). Ignore numbers that belong to other tables at the edges. If no number is written, return null. Also count the chairs drawn around that middle table only (each chair is a small square, circle or seat shape touching or next to it); return 0 if no chairs are drawn. Return one entry per index.`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));
const one = (v) => Math.round(v * 10) / 10;

function fromBox(box) {
  const raw = Array.isArray(box) ? box : [box?.x_min, box?.y_min, box?.x_max, box?.y_max];
  const [a, b, c, d] = raw.map((v) => clamp(v, 0, 100));
  const x0 = Math.min(a, c);
  const x1 = Math.max(a, c);
  const y0 = Math.min(b, d);
  const y1 = Math.max(b, d);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

const cleanLabel = (v) => {
  const s = typeof v === "string" ? v.replace(/^table\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return s || null;
};

export function cleanLayout(raw, labels = new Map()) {
  const tables = (Array.isArray(raw?.tables) ? raw.tables : [])
    .filter((t) => SHAPES.includes(t?.shape))
    .slice(0, MAX_TABLES)
    .map((t, i) => {
      const b = t.box ? fromBox(t.box) : { x: Number(t.x), y: Number(t.y) };
      return {
        label: labels.has(i) ? labels.get(i) : cleanLabel(t.label),
        shape: t.shape,
        seats: Math.round(clamp(t.seats, 1, 30)),
        x: one(clamp(b.x, 3, 97)),
        y: one(clamp(b.y, 4, 96)),
      };
    });
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((i) => ITEM_KINDS.includes(i?.kind))
    .slice(0, MAX_ITEMS)
    .map((i) => {
      const b = i.box ? fromBox(i.box) : { x: Number(i.x), y: Number(i.y), w: Number(i.w), h: Number(i.h) };
      return { kind: i.kind, x: one(clamp(b.x, 0, 100)), y: one(clamp(b.y, 0, 100)), w: one(clamp(b.w, 1, 100)), h: one(clamp(b.h, 1, 100)), rotation: 0 };
    });
  return { is_floor_plan: raw?.is_floor_plan !== false && (tables.length > 0 || items.length > 0), tables, items };
}

export async function preparePlan(buffer) {
  const meta = await sharp(buffer).rotate().metadata();
  const long = Math.max(meta.width || 1, meta.height || 1);
  const scale = LONG_SIDE / long;
  const plain = await sharp(buffer).rotate().resize({ width: Math.round((meta.width || 1) * scale), height: Math.round((meta.height || 1) * scale), fit: "fill" }).flatten({ background: "#ffffff" }).png().toBuffer();
  const { width, height } = await sharp(plain).metadata();
  const font = Math.round(Math.max(14, LONG_SIDE / 90));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  for (let g = 0; g <= 100; g += 10) {
    const x = (g / 100) * width;
    const y = (g / 100) * height;
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgba(220,0,0,0.35)" stroke-width="1.5"/>`;
    svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(220,0,0,0.35)" stroke-width="1.5"/>`;
    if (g < 100) {
      svg += `<text x="${x + 3}" y="${font + 2}" font-size="${font}" font-family="Arial" font-weight="bold" fill="#d00000">${g}</text>`;
      if (g > 0) svg += `<text x="3" y="${y + font + 2}" font-size="${font}" font-family="Arial" font-weight="bold" fill="#d00000">${g}</text>`;
    }
  }
  svg += `</svg>`;
  const gridded = await sharp(plain).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88 }).toBuffer();
  return { plain, gridded, width, height };
}

export async function contactSheet(plain, width, height, boxes) {
  const cell = 260;
  const label = 34;
  const cols = 6;
  const rows = Math.ceil(boxes.length / cols);
  const tiles = await Promise.all(
    boxes.map(async (box, i) => {
      const b = fromBox(box);
      const side = Math.max(b.w, b.h) * 1.6 + 3;
      const left = Math.round(clamp((b.x - side / 2) / 100, 0, 1) * width);
      const top = Math.round(clamp((b.y - side / 2) / 100, 0, 1) * height);
      const w = Math.max(8, Math.min(width - left, Math.round((side / 100) * width)));
      const h = Math.max(8, Math.min(height - top, Math.round((side / 100) * height)));
      const tile = await sharp(plain).extract({ left, top, width: w, height: h }).resize(cell, cell, { fit: "contain", background: "#ffffff" }).png().toBuffer();
      return { input: tile, left: (i % cols) * cell, top: Math.floor(i / cols) * (cell + label) };
    })
  );
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (cell + label)}">`;
  boxes.forEach((_, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + label);
    svg += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" fill="none" stroke="#999" stroke-width="2"/>`;
    svg += `<text x="${x + cell / 2}" y="${y + cell + label - 8}" font-size="26" font-family="Arial" font-weight="bold" fill="#d00000" text-anchor="middle">${i}</text>`;
  });
  svg += `</svg>`;
  return sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: "#ffffff" } })
    .composite([...tiles, { input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function ask(apiKey, prompt, jpeg, schema, name) {
  let last = null;
  for (const model of MODELS) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" } }] },
        ],
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return JSON.parse(json?.choices?.[0]?.message?.content || "{}");
    }
    last = res.status;
    if (![400, 403, 404].includes(res.status)) break;
  }
  throw new Error(`ai_failed_${last}`);
}

const SCAN_W = 900;

export async function shapeBoxes(png) {
  const { data, info } = await sharp(png).greyscale().normalise().resize({ width: SCAN_W }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) ink[i] = data[i] < 128 ? 1 : 0;
  const seen = new Uint8Array(W * H);
  const out = [];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start += 1) {
    if (!ink[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      n += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || !ink[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < 6 || h < 6) continue;
    out.push({ x_min: (x0 / W) * 100, y_min: (y0 / H) * 100, x_max: ((x1 + 1) / W) * 100, y_max: ((y1 + 1) / H) * 100, fill: n / (w * h) });
  }
  return out;
}

export function snapTables(found, shapes) {
  if (!found.length || !shapes.length) return found;
  const inside = (a, b) => a !== b && a.x_min >= b.x_min && a.y_min >= b.y_min && a.x_max <= b.x_max && a.y_max <= b.y_max;
  const candidates = shapes
    .filter((s) => s.fill < 0.7 && !shapes.some((o) => inside(s, o)))
    .map((s) => ({ s, b: fromBox(s) }));
  if (!candidates.length) return found;
  const raw = found.map((t) => fromBox(t.box));
  const area = (b) => Math.max(0.25, b.w * b.h);
  const fits = (b, c) => {
    const r = area(c.b) / area(b);
    return r >= 0.3 && r <= 4;
  };
  const sizes = raw.map((b) => Math.max(b.w, b.h)).sort((p, q) => p - q);
  const typical = sizes[Math.floor(sizes.length / 2)] || 5;
  const median = (v) => {
    const sorted = [...v].sort((p, q) => p - q);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const nearest = raw
    .map((b) => {
      let best = null;
      for (const c of candidates) if (fits(b, c) && (!best || Math.hypot(c.b.x - b.x, c.b.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y))) best = c.b;
      return best ? { dx: best.x - b.x, dy: best.y - b.y } : null;
    })
    .filter(Boolean);
  const shiftX = median(nearest.map((n) => n.dx));
  const shiftY = median(nearest.map((n) => n.dy));
  const boxes = raw.map((b) => ({ ...b, x: b.x + shiftX, y: b.y + shiftY }));
  const pairs = [];
  boxes.forEach((b, ti) =>
    candidates.forEach((c, ci) => {
      if (fits(b, c)) pairs.push({ ti, ci, d: Math.hypot(c.b.x - b.x, (c.b.y - b.y) * 0.8) });
    })
  );
  pairs.sort((p, q) => p.d - q.d);
  const tableOf = new Map();
  const usedC = new Set();
  for (const reach of [Math.max(8, typical * 1.5), Math.max(30, typical * 5)]) {
    for (const p of pairs) {
      if (p.d > reach || tableOf.has(p.ti) || usedC.has(p.ci)) continue;
      tableOf.set(p.ti, p.ci);
      usedC.add(p.ci);
    }
  }
  const snapped = found.map((t, ti) => {
    if (!tableOf.has(ti)) return t;
    const { s } = candidates[tableOf.get(ti)];
    return { ...t, box: { x_min: s.x_min, y_min: s.y_min, x_max: s.x_max, y_max: s.y_max } };
  });
  const matched = [...tableOf.keys()].map((ti) => ({ t: snapped[ti], b: candidates[tableOf.get(ti)].b }));
  if (matched.length < 3 || matched.length / found.length < 0.6) return snapped;
  const aspect = (b) => b.w / Math.max(0.25, b.h);
  const extras = [];
  candidates.forEach((c, ci) => {
    if (usedC.has(ci)) return;
    const twin = matched.find(({ b }) => {
      const r = area(c.b) / area(b);
      const a = aspect(c.b) / aspect(b);
      return r >= 0.8 && r <= 1.25 && ((a >= 0.75 && a <= 1.33) || (a >= 0.75 * aspect(b) * aspect(b) && a <= 1.33 * aspect(b) * aspect(b)));
    });
    if (!twin) return;
    const rotated = Math.abs(aspect(c.b) - aspect(twin.b)) > 0.3;
    extras.push({
      box: { x_min: c.s.x_min, y_min: c.s.y_min, x_max: c.s.x_max, y_max: c.s.y_max },
      shape: twin.t.shape,
      seats: twin.t.seats,
      label: null,
      ...(rotated ? { rotated: true } : {}),
    });
  });
  return [...snapped, ...extras].slice(0, MAX_TABLES);
}

export function countChairs(tables, shapes) {
  const inside = (a, b) => a !== b && a.x_min >= b.x_min && a.y_min >= b.y_min && a.x_max <= b.x_max && a.y_max <= b.y_max;
  const outer = shapes.filter((s) => !shapes.some((o) => inside(s, o)));
  const counts = tables.map(() => 0);
  const shorts = tables.map((t) => Math.min(t.box.x_max - t.box.x_min, t.box.y_max - t.box.y_min));
  const gap = (s, b) => {
    const cx = (s.x_min + s.x_max) / 2;
    const cy = (s.y_min + s.y_max) / 2;
    const dx = Math.max(b.x_min - cx, 0, cx - b.x_max);
    const dy = Math.max(b.y_min - cy, 0, cy - b.y_max);
    return Math.hypot(dx, dy * 1.6);
  };
  for (const s of outer) {
    const big = Math.max(s.x_max - s.x_min, s.y_max - s.y_min);
    let best = -1;
    let dist = Infinity;
    tables.forEach((t, i) => {
      if (big < shorts[i] * 0.12 || big > shorts[i] * 0.75) return;
      const b = t.box;
      const cx = (s.x_min + s.x_max) / 2;
      const cy = (s.y_min + s.y_max) / 2;
      if (cx > b.x_min && cx < b.x_max && cy > b.y_min && cy < b.y_max) return;
      const d = gap(s, b);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best >= 0 && dist <= shorts[best] * 0.7) counts[best] += 1;
  }
  return counts;
}

export function snapItems(items, shapes, tableBoxes = []) {
  const taken = new Set(tableBoxes.map((b) => `${b.x_min.toFixed(2)}|${b.y_min.toFixed(2)}`));
  const used = new Set();
  return items.map((it) => {
    const b = fromBox(it.box);
    let best = null;
    let score = Infinity;
    shapes.forEach((s, i) => {
      if (used.has(i) || taken.has(`${s.x_min.toFixed(2)}|${s.y_min.toFixed(2)}`)) return;
      const c = fromBox(s);
      const ratio = (c.w * c.h) / Math.max(1, b.w * b.h);
      if (ratio < 0.35 || ratio > 2.8) return;
      const d = Math.hypot(c.x - b.x, c.y - b.y);
      if (d > Math.max(10, Math.max(b.w, b.h) * 0.6)) return;
      const sc = d + Math.abs(Math.log(ratio)) * 10;
      if (sc < score) {
        score = sc;
        best = i;
      }
    });
    if (best === null) return it;
    used.add(best);
    const s = shapes[best];
    return { ...it, box: { x_min: s.x_min, y_min: s.y_min, x_max: s.x_max, y_max: s.y_max } };
  });
}

export function reconcileLabels(labels, firstPass) {
  const key = (v) => String(v || "").toUpperCase();
  for (let i = 0; i < firstPass.length; i += 1) if (!labels.has(i) || !labels.get(i)) labels.set(i, firstPass[i]);
  const count = () => {
    const c = new Map();
    for (const v of labels.values()) if (v) c.set(key(v), (c.get(key(v)) || 0) + 1);
    return c;
  };
  let seen = count();
  for (let i = 0; i < firstPass.length; i += 1) {
    const mine = labels.get(i);
    const other = firstPass[i];
    if (!mine || (seen.get(key(mine)) || 0) < 2 || !other || key(other) === key(mine) || seen.has(key(other))) continue;
    labels.set(i, other);
    seen = count();
  }
  return labels;
}

export async function readLayout(apiKey, buffer) {
  const { plain, gridded, width, height } = await preparePlan(buffer);
  const raw = await ask(apiKey, DETECT_PROMPT, gridded, DETECT_SCHEMA, "floor_plan");
  const found = (Array.isArray(raw?.tables) ? raw.tables : []).filter((t) => SHAPES.includes(t?.shape)).slice(0, MAX_TABLES);
  const shapes = await shapeBoxes(plain).catch(() => []);
  const snappedTables = snapTables(found, shapes);
  const chairs = countChairs(snappedTables, shapes);
  const tables = snappedTables.map((t, i) => ({ ...t, votes: [t.seats, ...(chairs[i] >= 2 ? [chairs[i]] : [])] }));
  const items = snapItems(Array.isArray(raw?.items) ? raw.items.filter((i) => ITEM_KINDS.includes(i?.kind)) : [], shapes, tables.map((t) => t.box));
  const labels = new Map();
  if (tables.length) {
    try {
      const sheet = await contactSheet(plain, width, height, tables.map((t) => t.box));
      const read = await ask(apiKey, LABEL_PROMPT, sheet, LABEL_SCHEMA, "table_labels");
      for (const l of Array.isArray(read?.labels) ? read.labels : []) {
        if (Number.isInteger(l?.index) && l.index >= 0 && l.index < tables.length) {
          labels.set(l.index, cleanLabel(l.label) ?? cleanLabel(tables[l.index].label));
          if (Number.isInteger(l.seats) && l.seats >= 2 && l.seats <= 30) tables[l.index].votes.push(l.seats);
        }
      }
      reconcileLabels(labels, tables.map((t) => cleanLabel(t.label)));
      tables.forEach((t, i) => {
        const v = t.votes.filter((n) => Number.isInteger(n) && n > 0).sort((p, q) => p - q);
        if (v.length) tables[i] = { ...t, seats: v.length % 2 ? v[(v.length - 1) / 2] : Math.max(v[v.length / 2 - 1], v[v.length / 2]) };
      });
    } catch (e) {
      console.error("table label pass failed", e?.message);
    }
  }
  return cleanLayout({ ...raw, tables, items }, labels);
}
