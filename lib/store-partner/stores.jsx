import { supabaseBrowser } from "@/lib/supabaseBrowser";

const STORE_SELECT =
  "id,name,city,is_active,logo_url,cover_image,store_type,owner_user_id,pickup_mode,supports_time_slots,slot_duration_minutes,slot_buffer_minutes,slot_advance_days,slot_max_per_window";

async function attachStoreSubscriptionState(stores) {
  const ids = Array.from(new Set((stores || []).map((store) => store?.id).filter(Boolean)));
  if (!ids.length) return stores || [];

  const { data, error } = await supabaseBrowser
    .from("store_subscriptions")
    .select("store_id, status, pickup_premium_enabled, expires_at, created_at")
    .in("store_id", ids)
    .in("status", ["active", "trial"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  const byStore = new Map();
  (data || []).forEach((row) => {
    const key = String(row.store_id);
    if (!byStore.has(key)) byStore.set(key, row);
  });

  return (stores || []).map((store) => {
    const subscription = byStore.get(String(store.id));
    return {
      ...store,
      pickup_premium_enabled: Boolean(subscription?.pickup_premium_enabled),
      pickup_premium_expires_at: subscription?.expires_at || null,
      subscription_status: subscription?.status || null,
    };
  });
}

/**
 * Loads stores the current partner can access.
 * Priority:
 * 1) store_members (recommended)
 * 2) stores.owner_user_id fallback
 * 3) stores.created_by fallback
 */
export async function fetchMyStores() {
  const { data: auth } = await supabaseBrowser.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Not logged in.");

  // 1) Try membership table (recommended)
  const memRes = await supabaseBrowser
    .from("store_members")
    .select(`store_id, stores:store_id(${STORE_SELECT})`)
    .eq("user_id", user.id);

  if (!memRes.error && Array.isArray(memRes.data) && memRes.data.length) {
    const stores = memRes.data.map((row) => row?.stores || null).filter(Boolean);
    return attachStoreSubscriptionState(stores);
  }

  // 2) Fallback: stores.owner_user_id
  const { data, error } = await supabaseBrowser
    .from("stores")
    .select(STORE_SELECT)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (!error && Array.isArray(data) && data.length) {
    return attachStoreSubscriptionState(data);
  }

  // 3) Fallback: stores.created_by
  const createdByRes = await supabaseBrowser
    .from("stores")
    .select(STORE_SELECT)
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (createdByRes.error) throw createdByRes.error;
  return attachStoreSubscriptionState(createdByRes.data || []);
}
