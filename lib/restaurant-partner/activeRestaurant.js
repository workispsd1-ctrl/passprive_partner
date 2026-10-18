import { supabaseBrowser } from "@/lib/supabaseBrowser";

const STORAGE_KEY = "restaurant_partner_selected_restaurant_id";

export async function fetchMyRestaurants(client = supabaseBrowser) {
  const { data, error } = await client.rpc("my_restaurants");
  if (error) throw error;
  return data || [];
}

export function getSavedRestaurantId() {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function selectRestaurant(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {}
  window.location.reload();
}

export async function resolveActiveRestaurant(client = supabaseBrowser) {
  const list = await fetchMyRestaurants(client);
  const saved = getSavedRestaurantId();
  const active = list.find((r) => String(r.id) === String(saved)) || list[0] || null;
  return { list, active, isMaster: list.some((r) => r.access === "master") };
}

export async function getActiveRestaurantId(client = supabaseBrowser) {
  const { active } = await resolveActiveRestaurant(client);
  return active?.id || null;
}
