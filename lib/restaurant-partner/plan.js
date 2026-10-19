import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

// "discoverable" = listed only, "deals" = discoverable + deals switch on, "full" = booking or pay bill.
export function planFor(restaurant) {
  const level = String(restaurant?.service_level || "discoverable").toLowerCase();
  if (level !== "discoverable") return "full";
  return restaurant?.deals_enabled === true ? "deals" : "discoverable";
}

// Pages a discoverable/deals restaurant can open read-only, with a lock in the sidebar.
export const LOCKED_ROUTES = [
  "/restaurant/dashboard",
  "/restaurant/bookings",
  "/restaurant/staff",
  "/restaurant/pos",
  "/restaurant/table-orders",
  "/restaurant/table-layout",
  "/restaurant/reviews",
  "/restaurant/analytics",
  "/restaurant/transactions",
  "/restaurant/payouts",
  "/restaurant/add-request",
];

const matches = (pathname, href) => pathname === href || pathname?.startsWith(`${href}/`);

export function isRouteLocked(plan, pathname) {
  if (plan === "full" || !plan) return false;
  if (plan === "discoverable" && matches(pathname, "/restaurant/offers")) return true;
  return LOCKED_ROUTES.some((href) => matches(pathname, href));
}

export function isNavHidden(plan, href) {
  return plan === "discoverable" && href === "/restaurant/offers";
}

let cached = null;

// One fetch per page load, shared by the sidebar and the shell.
export function fetchRestaurantPlan(client = supabaseBrowser) {
  if (!cached) {
    cached = (async () => {
      const id = await getActiveRestaurantId(client);
      if (!id) return { restaurantId: null, plan: "full" };
      const { data, error } = await client
        .from("restaurants")
        .select("id, service_level, deals_enabled")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return { restaurantId: id, plan: planFor(data) };
    })().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
