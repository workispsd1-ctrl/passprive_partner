import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

// "discoverable" = listed only, "deals" = discoverable + deals switch on,
// "booking" = book a table, "payments" = book a table + pay bill.
export function planFor(restaurant) {
  const level = String(restaurant?.service_level || "discoverable").toLowerCase();
  if (level === "payments") return "payments";
  if (level === "booking") return "booking";
  return restaurant?.deals_enabled === true ? "deals" : "discoverable";
}

// Pages each plan can open read-only, with a lock in the sidebar.
const LISTING_LOCKED = [
  "/restaurant/dashboard",
  "/restaurant/bookings",
  "/restaurant/staff",
  "/restaurant/pos",
  "/restaurant/table-orders",
  "/restaurant/table-layout",
  "/restaurant/analytics",
  "/restaurant/transactions",
];

const LOCKED_ROUTES = {
  discoverable: [...LISTING_LOCKED, "/restaurant/offers"],
  deals: LISTING_LOCKED,
  booking: ["/restaurant/table-orders", "/restaurant/table-layout"],
  payments: [],
};

const matches = (pathname, href) => pathname === href || pathname?.startsWith(`${href}/`);

export function isRouteLocked(plan, pathname) {
  return (LOCKED_ROUTES[plan] || []).some((href) => matches(pathname, href));
}

export function isNavHidden(plan, href) {
  if (plan === "booking") return href === "/restaurant/table-layout";
  return plan === "discoverable" && href === "/restaurant/offers";
}

// Menu sections, items and table QR ordering are a pay-bill feature.
export function hasMenuCatalogue(plan) {
  return plan === "payments";
}

let cached = null;

// One fetch per page load, shared by the sidebar, the shell and pages.
export function fetchRestaurantPlan(client = supabaseBrowser) {
  if (!cached) {
    cached = (async () => {
      const id = await getActiveRestaurantId(client);
      if (!id) return { restaurantId: null, plan: null };
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
