import { randomUUID } from "node:crypto";

export const SPECIAL_ROLES = ["cashier", "restaurant_cashier", "restaurant_admin", "admin"];

export function specialItem(body, id = randomUUID()) {
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const price = Math.round(Number(body?.price) * 100) / 100;
  if (!name) return { error: "Enter the dish name." };
  if (!Number.isFinite(price) || price <= 0 || price > 100000) return { error: "Enter a price above 0." };
  const description = String(body?.description || "").trim().slice(0, 200) || null;
  return {
    kind: body?.kind === "Bar" ? "Bar" : "Kitchen",
    item: {
      id,
      name,
      price,
      description,
      is_veg: body?.is_veg === true,
      is_available: true,
      is_bestseller: false,
      is_special: true,
      variants: [],
      image_urls: [],
      modifier_groups: [],
      subcategory_id: null,
    },
  };
}
