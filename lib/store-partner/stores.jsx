import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Loads stores the current partner can access.
 * Priority:
 * 1) store_members (recommended)
 * 2) stores.created_by fallback
 */
export async function fetchMyStores() {
  const { data: auth } = await supabaseBrowser.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Not logged in.");

  // 1) Try membership table (recommended)
  const memRes = await supabaseBrowser
    .from("store_members")
    .select("store_id, stores:stores(id,name,city,is_active,logo_url,cover_image_url)")
    .eq("user_id", user.id);

  if (!memRes.error && Array.isArray(memRes.data) && memRes.data.length) {
    return memRes.data.map((row) => row.stores).filter(Boolean);
  }

  // 2) Fallback: stores.created_by
  const { data, error } = await supabaseBrowser
    .from("stores")
    .select("id,name,city,is_active,logo_url,cover_image_url")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
