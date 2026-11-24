import sharp from "sharp";

export const ITEM_KINDS = ["pool", "bar", "wall", "stage", "entrance", "plant"];
const SHAPES = ["circle", "square", "rectangle"];
const MAX_TABLES = 80;
const MAX_ITEMS = 24;
const MODEL = "gpt-4o";

const SCHEMA = {
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
        required: ["label", "shape", "seats", "x", "y"],
        properties: {
          label: { type: ["string", "null"] },
          shape: { type: "string", enum: SHAPES },
          seats: { type: "integer" },
          x: { type: "number" },
          y: { type: "number" },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "x", "y", "w", "h", "rotation"],
        properties: {
          kind: { type: "string", enum: ITEM_KINDS },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
          rotation: { type: "integer", enum: [0, 90] },
        },
      },
    },
  },
};

const PROMPT = `You read restaurant floor plans (architect plans, top-down drawings or hand sketches) and list what is on them.
Coordinates are percentages of the image: x from the left edge (0) to the right edge (100), y from the top (0) to the bottom (100).
For every dining table give its centre (x, y), its shape (circle, square or rectangle), the number of seats (count the chairs; if none are drawn use 2 for small tables, 4 for normal, 6+ for long ones) and the table number or name exactly as written on it, or null if nothing is written.
Also list fixed features: pool, bar (bar counter), wall, stage, entrance (door), plant. For each give its centre (x, y), its width w and height h as percentages of the image, and rotation 0 (or 90 if it is drawn turned sideways).
Do not list chairs, sunbeds or decorations as tables. If the image is not a floor plan, set is_floor_plan to false and return empty lists.`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));
const one = (v) => Math.round(v * 10) / 10;

export function cleanLayout(raw) {
  const tables = (Array.isArray(raw?.tables) ? raw.tables : [])
    .filter((t) => SHAPES.includes(t?.shape))
    .slice(0, MAX_TABLES)
    .map((t) => ({
      label: typeof t.label === "string" && t.label.trim() ? t.label.trim().slice(0, 40) : null,
      shape: t.shape,
      seats: Math.round(clamp(t.seats, 1, 30)),
      x: one(clamp(t.x, 3, 97)),
      y: one(clamp(t.y, 4, 96)),
    }));
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((i) => ITEM_KINDS.includes(i?.kind))
    .slice(0, MAX_ITEMS)
    .map((i) => ({
      kind: i.kind,
      x: one(clamp(i.x, 0, 100)),
      y: one(clamp(i.y, 0, 100)),
      w: one(clamp(i.w, 1, 100)),
      h: one(clamp(i.h, 1, 100)),
      rotation: i.rotation === 90 ? 90 : 0,
    }));
  return { is_floor_plan: raw?.is_floor_plan !== false && (tables.length > 0 || items.length > 0), tables, items };
}

export async function readLayout(apiKey, buffer) {
  const jpeg = await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "floor_plan", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" } }] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai_failed_${res.status}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || "{}";
  return cleanLayout(JSON.parse(text));
}
