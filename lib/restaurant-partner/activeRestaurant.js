import { supabaseBrowser } from "@/lib/supabaseBrowser";

const STORAGE_KEY = "restaurant_partner_selected_restaurant_id";
export const RESTAURANT_CHANGED_EVENT = "restaurant-partner:changed";

let cache = { userId: null, promise: null };

export function invalidateMyRestaurants() {
  cache = { userId: null, promise: null };
}

if (typeof window !== "undefined") {
  supabaseBrowser.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") return;
    if (session?.user?.id !== cache.userId) invalidateMyRestaurants();
  });
}

export async function fetchMyRestaurants(client = supabaseBrowser) {
  const { data } = await client.auth.getSession();
  const userId = data?.session?.user?.id || null;
  if (!userId) return [];
  if (cache.userId === userId && cache.promise) return cache.promise;
  const promise = client.rpc("my_restaurants").then(({ data: rows, error }) => {
    if (error) {
      if (cache.promise === promise) invalidateMyRestaurants();
      throw error;
    }
    return rows || [];
  });
  cache = { userId, promise };
  return promise;
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
  window.dispatchEvent(new CustomEvent(RESTAURANT_CHANGED_EVENT, { detail: String(id) }));
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
