import { reply, requireTerminal, serverError } from "../_terminal";

// Staff devices can read the restaurant profile. Changing settings, the visibility switch and the
// bank/payout details stay in the owner's dashboard, so this route has no write method.
export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;

    const [restaurantRes, tagsRes, mediaRes] = await Promise.all([
      admin
        .from("restaurants")
        .select("id,name,phone,area,city,full_address,cost_for_two,slug,cover_image,latitude,longitude,booking_enabled,avg_duration_minutes,max_bookings_per_slot,advance_booking_days,is_active")
        .eq("id", restaurantId)
        .single(),
      admin
        .from("restaurant_tags")
        .select("tag_value,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("tag_type", "cuisine")
        .order("sort_order", { ascending: true }),
      admin
        .from("restaurant_media_assets")
        .select("asset_type,file_url,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .in("asset_type", ["food", "ambience", "cover"])
        .order("sort_order", { ascending: true }),
    ]);

    if (restaurantRes.error) return serverError(restaurantRes.error);
    if (tagsRes.error) return serverError(tagsRes.error);
    if (mediaRes.error) return serverError(mediaRes.error);

    const cuisines = (tagsRes.data || []).map((r) => r.tag_value).filter(Boolean);
    const mediaRows = mediaRes.data || [];
    const food_images = mediaRows.filter((r) => r.asset_type === "food").map((r) => r.file_url);
    const ambience_images = mediaRows.filter((r) => r.asset_type === "ambience").map((r) => r.file_url);

    return reply({
      ok: true,
      restaurant: { ...restaurantRes.data, cuisines, food_images, ambience_images },
    });
  } catch (error) {
    return serverError(error);
  }
}
