import sharp from "sharp";

const MODEL = "gpt-4o";
const MAX_SECTIONS = 40;
const MAX_ITEMS = 150;
const PHOTO_HOSTS = ["images.pexels.com"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_menu", "sections"],
  properties: {
    is_menu: { type: "boolean" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "group", "items"],
        properties: {
          name: { type: "string" },
          group: { type: "string", enum: ["Kitchen", "Bar"] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "price", "variants", "is_veg", "photo_query"],
              properties: {
                name: { type: "string" },
                description: { type: ["string", "null"] },
                price: { type: ["number", "null"] },
                variants: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "price"],
                    properties: { name: { type: "string" }, price: { type: "number" } },
                  },
                },
                is_veg: { type: ["boolean", "null"] },
                photo_query: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

const PROMPT = `You read restaurant menus (photos or PDFs, often in French or English, prices in Mauritian rupees) and copy them exactly.
Return every section in the order it appears, with every dish in that section in order.
For each dish: the name exactly as written (keep the original language and spelling), the description if one is printed (else null), and the price as a plain number without currency.
If a dish has several sizes or options with their own prices (e.g. Small/Large, 6pc/12pc, Glass/Bottle), put them in variants with their prices and set price to null.
group is "Bar" for drinks sections (cocktails, wines, beers, soft drinks, juices, coffee, tea, spirits) and "Kitchen" for food.
is_veg is true only if the dish clearly has no meat or fish, false if it clearly has meat or fish, null if unsure.
photo_query is 2 to 5 English words describing what the dish looks like for a stock-photo search (e.g. "chicken fried noodles", "mojito cocktail glass", "chocolate lava cake").
Do not invent dishes or prices. If the files are not a menu, set is_menu to false and return no sections.`;

const text = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const price = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000 ? Math.round(Number(v) * 100) / 100 : null);

export function cleanMenu(raw) {
  const sections = (Array.isArray(raw?.sections) ? raw.sections : [])
    .slice(0, MAX_SECTIONS)
    .map((s) => ({
      name: text(s?.name, 80) || "Menu",
      group: s?.group === "Bar" ? "Bar" : "Kitchen",
      items: (Array.isArray(s?.items) ? s.items : [])
        .slice(0, MAX_ITEMS)
        .map((i) => {
          const variants = (Array.isArray(i?.variants) ? i.variants : [])
            .map((v) => ({ name: text(v?.name, 60), price: price(v?.price) }))
            .filter((v) => v.name && v.price !== null)
            .slice(0, 12);
          return {
            name: text(i?.name, 120),
            description: text(i?.description, 400) || null,
            price: variants.length ? null : price(i?.price),
            variants,
            is_veg: typeof i?.is_veg === "boolean" ? i.is_veg : null,
            photo_query: text(i?.photo_query, 60) || text(i?.name, 60),
          };
        })
        .filter((i) => i.name && (i.price !== null || i.variants.length)),
    }))
    .filter((s) => s.items.length);
  return { is_menu: raw?.is_menu !== false && sections.length > 0, sections };
}

async function filePart(file) {
  const buffer = Buffer.from(String(file?.data || "").replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buffer.length) return null;
  if (String(file?.type).includes("pdf") || buffer.subarray(0, 4).toString() === "%PDF") {
    return { type: "file", file: { filename: text(file?.name, 80) || "menu.pdf", file_data: `data:application/pdf;base64,${buffer.toString("base64")}` } };
  }
  const jpeg = await sharp(buffer).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" } };
}

export async function readMenu(apiKey, files) {
  const parts = (await Promise.all(files.map(filePart))).filter(Boolean);
  if (!parts.length) return { is_menu: false, sections: [] };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: "json_schema", json_schema: { name: "menu", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: parts },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai_failed_${res.status}`);
  const json = await res.json();
  return cleanMenu(JSON.parse(json?.choices?.[0]?.message?.content || "{}"));
}

export async function searchPhotos(apiKey, queries) {
  const unique = [...new Set(queries.map((q) => text(q, 60).toLowerCase()).filter(Boolean))].slice(0, 40);
  const results = {};
  await Promise.all(
    unique.map(async (q) => {
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=6&orientation=square`, {
          headers: { Authorization: apiKey },
        });
        if (!res.ok) return;
        const json = await res.json();
        results[q] = (json?.photos || []).map((p) => ({ id: p.id, thumb: p.src?.medium, full: p.src?.large, by: p.photographer || null }));
      } catch {
        results[q] = [];
      }
    })
  );
  return results;
}

export function allowedPhoto(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && PHOTO_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
