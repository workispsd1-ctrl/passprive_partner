import { NextResponse } from "next/server";
import { requireTerminal, serverError } from "../_terminal";

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;

    const { data: reviews, error: reviewsErr } = await admin
      .from("restaurant_reviews")
      .select("id,rating,review_text,username_snapshot,created_at,owner_reply_text,owner_reply_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (reviewsErr) return serverError(reviewsErr);

    return NextResponse.json({ ok: true, reviews: reviews || [] });
  } catch (error) {
    return serverError(error);
  }
}
