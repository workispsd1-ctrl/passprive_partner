function normalizeMemberStore(storesField) {
  if (Array.isArray(storesField)) return storesField[0] || null;
  return storesField || null;
}

function mergeEntities(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row?.id) return;
    map.set(String(row.id), row);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

export async function loadPartnerOfferEntities(supabase, userId) {
  const storeOwnerRes = await supabase
    .from("stores")
    .select("id,name,city,is_active")
    .eq("owner_user_id", userId)
    .order("name", { ascending: true });

  if (storeOwnerRes.error) throw storeOwnerRes.error;

  const storeMemberRes = await supabase
    .from("store_members")
    .select("store_id, stores:store_id(id,name,city,is_active)")
    .eq("user_id", userId);

  if (storeMemberRes.error) throw storeMemberRes.error;

  const restaurantOwnerRes = await supabase
    .from("restaurants")
    .select("id,name,city,is_active")
    .eq("owner_user_id", userId)
    .order("name", { ascending: true });

  if (restaurantOwnerRes.error) throw restaurantOwnerRes.error;

  const stores = mergeEntities([
    ...(storeOwnerRes.data || []),
    ...(storeMemberRes.data || []).map((row) => normalizeMemberStore(row.stores)).filter(Boolean),
  ]).map((store) => ({
    ...store,
    owner_entity_type: "STORE",
    owner_entity_id: String(store.id),
    label: `${store.name}${store.city ? ` • ${store.city}` : ""}`,
  }));

  const restaurants = mergeEntities([
    ...(restaurantOwnerRes.data || []),
  ]).map((restaurant) => ({
    ...restaurant,
    owner_entity_type: "RESTAURANT",
    owner_entity_id: String(restaurant.id),
    label: `${restaurant.name}${restaurant.city ? ` • ${restaurant.city}` : ""}`,
  }));

  return {
    stores,
    restaurants,
    allEntities: [...stores, ...restaurants],
  };
}
