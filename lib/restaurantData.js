"use client";

function sortByOrderThenCreated(rows) {
  return [...(rows || [])].sort((a, b) => {
    const orderDiff = Number(a?.sort_order ?? 100) - Number(b?.sort_order ?? 100);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
  });
}

function toMenuShape(urls = []) {
  const clean = Array.isArray(urls) ? urls.filter(Boolean) : [];
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    full_menu_image_url: clean[0] || null,
    full_menu_image_urls: clean,
    sections: [],
  };
}

function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toStartAt(date) {
  return date ? `${date}T00:00:00` : null;
}

function toEndAt(date) {
  return date ? `${date}T23:59:59` : null;
}

function normalizeClockTime(value) {
  return String(value || "").slice(0, 5);
}

function mapReviewRow(row) {
  return {
    id: row.id,
    userName: row.username_snapshot || "Anonymous",
    userAvatar: row.avatar_snapshot || "",
    rating: row.rating == null ? null : Number(row.rating),
    food_rating: row.food_rating == null ? null : Number(row.food_rating),
    service_rating: row.service_rating == null ? null : Number(row.service_rating),
    ambience_rating: row.ambience_rating == null ? null : Number(row.ambience_rating),
    drinks_rating: row.drinks_rating == null ? null : Number(row.drinks_rating),
    crowd_rating: row.crowd_rating == null ? null : Number(row.crowd_rating),
    comment: row.review_text || "",
    createdAt: row.created_at || null,
    images: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    liked_tags: Array.isArray(row.liked_tags) ? row.liked_tags : [],
    reply: null,
  };
}

function mapOfferRow(row) {
  const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const offerKind = meta.offerKind || "GENERAL";
  return {
    id: row.id,
    offerKind,
    title: row.title || "",
    description: row.description || "",
    promoCode: String(meta.promoCode || "").toUpperCase(),
    discountType: meta.discountType || (row.offer_type === "percentage" ? "PERCENT" : "FLAT"),
    discountValue: row.discount_value ?? "",
    startDate: meta.startDate || isoDate(row.start_at),
    endDate: meta.endDate || isoDate(row.end_at),
    slotStart: meta.slotStart || "",
    slotEnd: meta.slotEnd || "",
    weekdays: Array.isArray(meta.weekdays) ? meta.weekdays : [],
    isActive: Boolean(row.is_active),
    conditions: {
      minGuests: meta.conditions?.minGuests ?? "",
      minBillAmount: meta.conditions?.minBillAmount ?? row.min_spend ?? "",
      newUsersOnly: Boolean(meta.conditions?.newUsersOnly),
    },
    visitRewards: {
      enabled: Boolean(meta.visitRewards?.enabled || offerKind === "VISIT"),
      tiers: Array.isArray(meta.visitRewards?.tiers) ? meta.visitRewards.tiers : [],
    },
    dishDiscount: {
      dishId: meta.dishDiscount?.dishId || "",
      dishName: meta.dishDiscount?.dishName || "",
      sectionId: meta.dishDiscount?.sectionId || "",
      sectionName: meta.dishDiscount?.sectionName || "",
    },
  };
}

function serializeOffer(offer) {
  const kind = offer.offerKind || "GENERAL";
  const discountType = offer.discountType || "FLAT";
  const hasDiscountValue = offer.discountValue !== "" && offer.discountValue != null;
  const numericDiscount = hasDiscountValue ? Number(offer.discountValue) : null;

  return {
    restaurant_id: offer.restaurant_id,
    title:
      kind === "VISIT"
        ? "Visit rewards"
        : String(offer.title || "").trim() || "Untitled offer",
    description: String(offer.description || "").trim() || null,
    badge_text: null,
    offer_type:
      kind === "VISIT"
        ? "custom"
        : discountType === "PERCENT"
        ? "percentage"
        : "flat",
    discount_value: Number.isFinite(numericDiscount) ? numericDiscount : null,
    min_spend:
      offer.conditions?.minBillAmount === "" || offer.conditions?.minBillAmount == null
        ? null
        : Number(offer.conditions.minBillAmount),
    start_at: toStartAt(offer.startDate),
    end_at: toEndAt(offer.endDate),
    is_active: Boolean(offer.isActive),
    metadata: {
      offerKind: kind,
      promoCode: String(offer.promoCode || "").toUpperCase(),
      discountType,
      startDate: offer.startDate || "",
      endDate: offer.endDate || "",
      slotStart: offer.slotStart || "",
      slotEnd: offer.slotEnd || "",
      weekdays: Array.isArray(offer.weekdays) ? offer.weekdays : [],
      conditions: {
        minGuests: offer.conditions?.minGuests ?? "",
        minBillAmount: offer.conditions?.minBillAmount ?? "",
        newUsersOnly: Boolean(offer.conditions?.newUsersOnly),
      },
      visitRewards: {
        enabled: Boolean(offer.visitRewards?.enabled),
        tiers: Array.isArray(offer.visitRewards?.tiers) ? offer.visitRewards.tiers : [],
      },
      dishDiscount: {
        dishId: offer.dishDiscount?.dishId || "",
        dishName: offer.dishDiscount?.dishName || "",
        sectionId: offer.dishDiscount?.sectionId || "",
        sectionName: offer.dishDiscount?.sectionName || "",
      },
    },
  };
}

export async function fetchOwnedRestaurantBase(supabase, userId, select) {
  const { data, error } = await supabase
    .from("restaurants")
    .select(select)
    .eq("owner_user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchRestaurantSettings(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(
    supabase,
    userId,
    "id, name, phone, area, city, full_address, cost_for_two, slug, cover_image, latitude, longitude, booking_enabled, avg_duration_minutes, max_bookings_per_slot, advance_booking_days, is_active"
  );

  const [tagsRes, mediaRes] = await Promise.all([
    supabase
      .from("restaurant_tags")
      .select("tag_type, tag_value, sort_order, created_at")
      .eq("restaurant_id", restaurant.id)
      .eq("tag_type", "cuisine"),
    supabase
      .from("restaurant_media_assets")
      .select("asset_type, file_url, sort_order, created_at")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .in("asset_type", ["food", "ambience"]),
  ]);

  if (tagsRes.error) throw tagsRes.error;
  if (mediaRes.error) throw mediaRes.error;

  const cuisines = sortByOrderThenCreated(tagsRes.data).map((row) => row.tag_value).filter(Boolean);
  const mediaRows = sortByOrderThenCreated(mediaRes.data);

  return {
    ...restaurant,
    cuisines,
    food_images: mediaRows.filter((row) => row.asset_type === "food").map((row) => row.file_url),
    ambience_images: mediaRows.filter((row) => row.asset_type === "ambience").map((row) => row.file_url),
  };
}

export async function fetchRestaurantMediaUrls(supabase, restaurantId, assetTypes) {
  const wanted = Array.isArray(assetTypes) ? assetTypes.filter(Boolean) : [];
  if (!wanted.length) return [];

  const { data, error } = await supabase
    .from("restaurant_media_assets")
    .select("asset_type, file_url, sort_order, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .in("asset_type", wanted);

  if (error) throw error;
  return sortByOrderThenCreated(data || []);
}

export async function replaceRestaurantMediaUrls(supabase, restaurantId, assetType, urls) {
  const cleanUrls = Array.from(new Set((Array.isArray(urls) ? urls : []).map((url) => String(url || "").trim()).filter(Boolean)));

  const deleteRes = await supabase
    .from("restaurant_media_assets")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("asset_type", assetType);
  if (deleteRes.error) throw deleteRes.error;

  if (!cleanUrls.length) return [];

  const { error } = await supabase.from("restaurant_media_assets").insert(
    cleanUrls.map((url, index) => ({
      restaurant_id: restaurantId,
      asset_type: assetType,
      file_url: url,
      sort_order: index,
      is_active: true,
    }))
  );
  if (error) throw error;

  return cleanUrls;
}

export async function saveRestaurantSettings(supabase, restaurantId, updates) {
  const { cuisines = [], food_images = [], ambience_images = [], ...restaurantUpdates } = updates;

  const { data, error } = await supabase
    .from("restaurants")
    .update(restaurantUpdates)
    .eq("id", restaurantId)
    .select(
      "id, name, phone, area, city, full_address, cost_for_two, slug, cover_image, latitude, longitude, booking_enabled, avg_duration_minutes, max_bookings_per_slot, advance_booking_days, is_active"
    )
    .single();

  if (error) throw error;

  const cuisineValues = Array.isArray(cuisines) ? cuisines.filter(Boolean) : [];
  const foodValues = Array.isArray(food_images) ? food_images.filter(Boolean) : [];
  const ambienceValues = Array.isArray(ambience_images) ? ambience_images.filter(Boolean) : [];

  const deleteCuisineRes = await supabase
    .from("restaurant_tags")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("tag_type", "cuisine");
  if (deleteCuisineRes.error) throw deleteCuisineRes.error;

  if (cuisineValues.length) {
    const { error: insertCuisineError } = await supabase.from("restaurant_tags").insert(
      cuisineValues.map((value, index) => ({
        restaurant_id: restaurantId,
        tag_type: "cuisine",
        tag_value: value,
        sort_order: index,
      }))
    );
    if (insertCuisineError) throw insertCuisineError;
  }

  const deleteMediaRes = await supabase
    .from("restaurant_media_assets")
    .delete()
    .eq("restaurant_id", restaurantId)
    .in("asset_type", ["food", "ambience"]);
  if (deleteMediaRes.error) throw deleteMediaRes.error;

  const mediaPayload = [
    ...foodValues.map((url, index) => ({
      restaurant_id: restaurantId,
      asset_type: "food",
      file_url: url,
      sort_order: index,
      is_active: true,
    })),
    ...ambienceValues.map((url, index) => ({
      restaurant_id: restaurantId,
      asset_type: "ambience",
      file_url: url,
      sort_order: index,
      is_active: true,
    })),
  ];

  if (mediaPayload.length) {
    const { error: insertMediaError } = await supabase.from("restaurant_media_assets").insert(mediaPayload);
    if (insertMediaError) throw insertMediaError;
  }

  return {
    ...data,
    cuisines: cuisineValues,
    food_images: foodValues,
    ambience_images: ambienceValues,
  };
}

export async function fetchOwnedRestaurantReviews(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(supabase, userId, "id, name");
  const { data, error } = await supabase
    .from("restaurant_reviews")
    .select(
      "id, rating, review_text, liked_tags, photo_urls, username_snapshot, avatar_snapshot, created_at, food_rating, service_rating, ambience_rating, drinks_rating, crowd_rating"
    )
    .eq("restaurant_id", restaurant.id)
    .eq("is_approved", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "",
    reviews: (data || []).map(mapReviewRow),
  };
}

export async function fetchOwnedRestaurantDashboard(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(supabase, userId, "id");
  const { data, error } = await supabase
    .from("restaurant_reviews")
    .select("id, rating, review_text, username_snapshot, avatar_snapshot, created_at")
    .eq("restaurant_id", restaurant.id)
    .eq("is_approved", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const reviews = (data || []).map(mapReviewRow);
  const rating =
    reviews.length > 0
      ? reviews.reduce((sum, row) => sum + Number(row.rating || 0), 0) / reviews.length
      : 0;

  return {
    restaurantId: restaurant.id,
    reviews,
    rating,
  };
}

export async function fetchOwnedRestaurantOffersData(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(supabase, userId, "id");

  const [offersRes, subscriptionRes, mediaRes] = await Promise.all([
    supabase
      .from("restaurant_offers")
      .select("id, title, description, badge_text, offer_type, discount_value, min_spend, start_at, end_at, is_active, metadata, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("restaurant_subscriptions")
      .select("id, plan_code, status, unlock_all, time_slot_enabled, repeat_rewards_enabled, dish_discounts_enabled")
      .eq("restaurant_id", restaurant.id)
      .in("status", ["active", "trial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchRestaurantMediaUrls(supabase, restaurant.id, ["menu"]),
  ]);

  if (offersRes.error) throw offersRes.error;
  if (subscriptionRes.error) throw subscriptionRes.error;

  const subscription = subscriptionRes.data || null;
  const unlockAll = Boolean(subscription?.unlock_all);
  const menuUrls = mediaRes.filter((row) => row.asset_type === "menu").map((row) => row.file_url);

  return {
    restaurantId: restaurant.id,
    offers: (offersRes.data || []).map(mapOfferRow),
    menu: toMenuShape(menuUrls),
    premiumAccess: {
      unlockAll,
      timeSlot: Boolean(subscription?.time_slot_enabled || unlockAll),
      repeatRewards: Boolean(subscription?.repeat_rewards_enabled || unlockAll),
      discounts: Boolean(subscription?.dish_discounts_enabled || unlockAll),
    },
    subscription,
  };
}

const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

export async function fetchRestaurantOpeningHours(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(supabase, userId, "id");

  const { data, error } = await supabase
    .from("restaurant_opening_hours")
    .select("id, restaurant_id, day_of_week, open_time, close_time, is_closed, created_at, updated_at")
    .eq("restaurant_id", restaurant.id)
    .order("day_of_week", { ascending: true });

  if (error) throw error;

  return {
    restaurantId: restaurant.id,
    hours: DAY_INDEXES.map((dayOfWeek) => {
      const row = (data || []).find((item) => Number(item.day_of_week) === dayOfWeek);
      return row
        ? {
            id: row.id,
            restaurant_id: row.restaurant_id,
            day_of_week: Number(row.day_of_week),
            open_time: normalizeClockTime(row.open_time),
            close_time: normalizeClockTime(row.close_time),
            is_closed: Boolean(row.is_closed),
          }
        : {
            id: null,
            restaurant_id: restaurant.id,
            day_of_week: dayOfWeek,
            open_time: "",
            close_time: "",
            is_closed: false,
          };
    }),
  };
}

export async function upsertRestaurantOpeningHour(supabase, restaurantId, row) {
  const payload = {
    restaurant_id: restaurantId,
    day_of_week: Number(row.day_of_week),
    is_closed: Boolean(row.is_closed),
    open_time: row.is_closed ? null : row.open_time || null,
    close_time: row.is_closed ? null : row.close_time || null,
  };

  if (row.id) {
    const { data, error } = await supabase
      .from("restaurant_opening_hours")
      .update(payload)
      .eq("id", row.id)
      .select("id, restaurant_id, day_of_week, open_time, close_time, is_closed")
      .single();
    if (error) throw error;
    return {
      ...data,
      open_time: normalizeClockTime(data?.open_time),
      close_time: normalizeClockTime(data?.close_time),
    };
  }

  const { data, error } = await supabase
    .from("restaurant_opening_hours")
    .insert(payload)
    .select("id, restaurant_id, day_of_week, open_time, close_time, is_closed")
    .single();

  if (error) throw error;
  return {
    ...data,
    open_time: normalizeClockTime(data?.open_time),
    close_time: normalizeClockTime(data?.close_time),
  };
}

export async function deleteRestaurantOpeningHour(supabase, rowId, restaurantId, dayOfWeek) {
  let query = supabase.from("restaurant_opening_hours").delete();

  if (rowId) {
    query = query.eq("id", rowId);
  } else if (restaurantId && dayOfWeek != null) {
    query = query.eq("restaurant_id", restaurantId).eq("day_of_week", Number(dayOfWeek));
  }

  const { error } = await query;
  if (error) throw error;
}

export async function replaceRestaurantOffers(supabase, restaurantId, offers) {
  const deleteRes = await supabase.from("restaurant_offers").delete().eq("restaurant_id", restaurantId);
  if (deleteRes.error) throw deleteRes.error;

  const sanitized = Array.isArray(offers) ? offers : [];
  if (!sanitized.length) return;

  const payload = sanitized.map((offer) => serializeOffer({ ...offer, restaurant_id: restaurantId }));
  const { error } = await supabase.from("restaurant_offers").insert(payload);
  if (error) throw error;
}

export async function activateRestaurantSubscription(supabase, restaurantId, planCode, access) {
  const nextAccess = {
    unlock_all: Boolean(access.unlockAll),
    time_slot_enabled: Boolean(access.timeSlot),
    repeat_rewards_enabled: Boolean(access.repeatRewards),
    dish_discounts_enabled: Boolean(access.discounts),
  };

  const { data: existing, error: existingError } = await supabase
    .from("restaurant_subscriptions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from("restaurant_subscriptions")
      .update({
        plan_code: planCode,
        ...nextAccess,
        status: "active",
        starts_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("restaurant_subscriptions").insert({
    restaurant_id: restaurantId,
    plan_code: planCode,
    status: "active",
    starts_at: new Date().toISOString(),
    ...nextAccess,
  });
  if (error) throw error;
}

export async function fetchOwnedRestaurantStatus(supabase, userId) {
  const restaurant = await fetchOwnedRestaurantBase(supabase, userId, "id, name, cover_image, is_active");
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("unlock_all, time_slot_enabled, repeat_rewards_enabled, dish_discounts_enabled")
    .eq("restaurant_id", restaurant.id)
    .in("status", ["active", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const unlockAll = Boolean(data?.unlock_all);
  const hasSubscription = Boolean(
    unlockAll || data?.time_slot_enabled || data?.repeat_rewards_enabled || data?.dish_discounts_enabled
  );

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "Restaurant",
    restaurantLogo: restaurant.cover_image || "",
    isActive: Boolean(restaurant.is_active),
    hasSubscription,
  };
}

export async function fetchRestaurantPublicMenuData(supabase, restaurantId) {
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, name, city, area, is_active")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!restaurant) return null;

  const media = await fetchRestaurantMediaUrls(supabase, restaurantId, ["menu"]);
  return {
    ...restaurant,
    menu: toMenuShape(media.filter((row) => row.asset_type === "menu").map((row) => row.file_url)),
  };
}
