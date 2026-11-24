import { reply, requireTerminal, serverError } from "../_terminal";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { data, error } = await ctx.admin
      .from("restaurant_receipt_logos")
      .select("png_b64, raster_b64, width, height, updated_at")
      .eq("restaurant_id", ctx.restaurantId)
      .maybeSingle();
    if (error) return serverError(error);
    return reply({ ok: true, logo: data ? { png: data.png_b64, raster: data.raster_b64, width: data.width, height: data.height, at: data.updated_at } : null });
  } catch (error) {
    return serverError(error);
  }
}
