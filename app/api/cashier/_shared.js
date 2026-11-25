import { BUSY, readRetry } from "@/lib/server/dbRetry";
import { createClient } from "@supabase/supabase-js";
import { NOT_IN_PLAN, restaurantHasPlan } from "@/lib/server/plan";

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
  const supabase = serverClient();
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  let userRes;
  let userErr;
  try {
    const out = await supabase.auth.getUser(token);
    userRes = out?.data;
    userErr = out?.error;
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("ENOTFOUND") || msg.includes("fetch failed") || msg.includes("getaddrinfo")) {
      return { error: "Supabase host is unreachable right now. Check DNS/network and Supabase URL.", status: 503 };
    }
    return { error: "Authentication service unavailable.", status: 503 };
  }
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const userId = userRes.user.id;

  const userRes2 = await readRetry(() => admin.from("users").select("role, full_name").eq("id", userId).maybeSingle());
  if (!userRes2) return BUSY;
  const userRow = userRes2.data;

  const role = String(userRow?.role || "").toLowerCase();
  const isWaiter = ["restaurant_waiter", "restaurant_bearer", "waiter"].includes(role);
  if (!isWaiter && !["cashier", "restaurant_cashier", "restaurantpartner", "restaurant_partner", "restaurant_admin", "admin", "superadmin"].includes(role)) {
    return { error: "Access denied", status: 403 };
  }

  const staffRes = await readRetry(() => admin.from("restaurant_staff").select("restaurant_id, role").eq("user_id", userId).limit(2));
  if (!staffRes) return BUSY;
  const staffRowRows = staffRes.data;
  const staffRow = staffRowRows?.length === 1 ? staffRowRows[0] : null;

  if (!staffRow?.restaurant_id) {
    return { error: "No restaurant assigned for this cashier account.", status: 403 };
  }

  const restRes = await readRetry(() => admin.from("restaurants").select("id, name, cover_image").eq("id", staffRow.restaurant_id).maybeSingle());
  if (!restRes) return BUSY;
  const restaurant = restRes.data;

  if (!restaurant?.id) return { error: "Restaurant not found", status: 404 };
  if (!(await restaurantHasPlan(admin, restaurant.id))) return { error: NOT_IN_PLAN, status: 403 };

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
