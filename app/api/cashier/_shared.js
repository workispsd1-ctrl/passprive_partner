import { BUSY, readRetry } from "@/lib/server/dbRetry";
import { createClient } from "@supabase/supabase-js";
import { NOT_IN_PLAN, STAFF_PLANS } from "@/lib/server/plan";
import { userIdFromToken } from "@/lib/server/verifyToken";

export function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

export async function resolveCashierRestaurant(token) {
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  let verified;
  try {
    verified = await userIdFromToken(token);
  } catch {
    return { error: "Authentication service unavailable.", status: 503 };
  }
  if (verified.error) {
    return verified.error.status >= 500 ? { error: "Authentication service unavailable.", status: 503 } : { error: "Unauthorized", status: 401 };
  }
  const userId = verified.userId;

  const [userRes2, staffRes] = await Promise.all([
    readRetry(() => admin.from("users").select("role, full_name").eq("id", userId).maybeSingle()),
    readRetry(() => admin.from("restaurant_staff").select("restaurant_id, role, restaurants:restaurant_id(id, name, cover_image, service_level)").eq("user_id", userId).limit(2)),
  ]);
  if (!userRes2 || !staffRes) return BUSY;
  const userRow = userRes2.data;

  const role = String(userRow?.role || "").toLowerCase();
  const isWaiter = ["restaurant_waiter", "restaurant_bearer", "waiter"].includes(role);
  if (!isWaiter && !["cashier", "restaurant_cashier", "restaurantpartner", "restaurant_partner", "restaurant_admin", "admin", "superadmin"].includes(role)) {
    return { error: "Access denied", status: 403 };
  }

  const staffRowRows = staffRes.data;
  const staffRow = staffRowRows?.length === 1 ? staffRowRows[0] : null;
  if (!staffRow?.restaurant_id) {
    return { error: "No restaurant assigned for this cashier account.", status: 403 };
  }
  const restaurant = Array.isArray(staffRow.restaurants) ? staffRow.restaurants[0] : staffRow.restaurants;
  if (!restaurant?.id) return { error: "Restaurant not found", status: 404 };
  if (!STAFF_PLANS.includes(String(restaurant.service_level || "").toLowerCase())) return { error: NOT_IN_PLAN, status: 403 };

  return {
    userId,
    role,
    isWaiter,
    userName: userRow?.full_name || "Cashier",
    fullName: String(userRow?.full_name || "").trim() || null,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "Restaurant",
    restaurantLogo: restaurant.cover_image || "",
    admin,
  };
}
