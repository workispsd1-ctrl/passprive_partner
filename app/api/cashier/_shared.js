import { createClient } from "@supabase/supabase-js";

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

  const { data: userRow } = await admin
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const role = String(userRow?.role || "").toLowerCase();
  if (!["cashier", "restaurant_cashier", "restaurantpartner", "restaurant_partner", "admin", "superadmin"].includes(role)) {
    return { error: "Access denied", status: 403 };
  }

  const { data: staffRow } = await admin
    .from("restaurant_staff")
    .select("restaurant_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!staffRow?.restaurant_id) {
    return { error: "No restaurant assigned for this cashier account.", status: 403 };
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, cover_image")
    .eq("id", staffRow.restaurant_id)
    .maybeSingle();

  if (!restaurant?.id) return { error: "Restaurant not found", status: 404 };

  return {
    userId,
    role,
    userName: userRow?.full_name || "Cashier",
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "Restaurant",
    restaurantLogo: restaurant.cover_image || "",
    admin,
  };
}
