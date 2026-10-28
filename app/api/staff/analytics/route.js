import { NextResponse } from "next/server";
import { readJson, requireTerminal, serverError } from "../_terminal";

const POS_WORDS = ["good", "great", "excellent", "amazing", "nice", "love", "perfect", "tasty", "delicious", "friendly", "clean"];
const NEG_WORDS = ["bad", "worst", "poor", "slow", "rude", "dirty", "cold", "late", "overpriced", "waste", "disappoint"];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function simpleSentiment(comment) {
  const words = tokenize(comment);
  let score = 0;
  for (const w of words) {
    if (POS_WORDS.includes(w)) score += 1;
    if (NEG_WORDS.includes(w)) score -= 1;
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function topKeywords(reviews, limit = 10) {
  const stop = new Set(["the","a","an","and","or","to","of","for","in","on","is","was","were","it","this","that","with","at","as","but","we","i","you","they","them","our","my","your","very","so","too","just","really","also"]);
  const freq = {};
  for (const r of reviews) {
    const words = tokenize(r?.review_text || "");
    for (const w of words) {
      if (w.length < 3) continue;
      if (stop.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w, c]) => ({ w, c }));
}

function startOfDayUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function isoDayUTC(d) {
  return startOfDayUTC(d).toISOString().slice(0, 10);
}

function daysAgoUTC(n) {
  const d = startOfDayUTC(new Date());
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;
    const body = await readJson(request);
    const range = String(body?.range || "30").trim();

    const seriesDays = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : 30;
    const fromDate = daysAgoUTC(seriesDays - 1);
    const fromIso = fromDate.toISOString();

    const [bookingsRes, reviewsRes, tableBookingsRes, offersRes] = await Promise.all([
      admin
        .from("restaurant_bookings")
        .select("id, customer_name, party_size, status, source, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(2000),
      admin
        .from("restaurant_reviews")
        .select("id, rating, review_text, username_snapshot, created_at, owner_reply_text, owner_reply_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("restaurant_table_bookings")
        .select("id, payment_status, total_amount, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(2000),
      admin
        .from("restaurant_offers")
        .select("id, is_active")
        .eq("restaurant_id", restaurantId)
        .limit(200),
    ]);

    if (bookingsRes.error) return serverError(bookingsRes.error);
    if (reviewsRes.error) return serverError(reviewsRes.error);
    if (tableBookingsRes.error) return serverError(tableBookingsRes.error);
    if (offersRes.error) return serverError(offersRes.error);

    const bookings = bookingsRes.data || [];
    const reviews = reviewsRes.data || [];
    const tableBookings = tableBookingsRes.data || [];
    const offers = offersRes.data || [];

    // Build day series
    const daily = {};
    const base = startOfDayUTC(new Date());
    for (let i = seriesDays - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      const key = isoDayUTC(d);
      daily[key] = { bookings: 0, guests: 0 };
    }

    const statusCounts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    const sourceCounts = {};
    let totalGuests = 0;

    for (const b of bookings) {
      const st = String(b.status || "pending").toLowerCase();
      if (statusCounts[st] != null) statusCounts[st] += 1;

      const src = b.source || "app";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      const ps = Number(b.party_size);
      if (Number.isFinite(ps)) totalGuests += ps;

      const d = b.created_at ? new Date(b.created_at) : null;
      if (d && !isNaN(d.getTime())) {
        const key = isoDayUTC(d);
        if (daily[key]) {
          daily[key].bookings += 1;
          daily[key].guests += Number.isFinite(ps) ? ps : 0;
        }
      }
    }

    const booking_series = Object.keys(daily).map((k) => ({
      day: k,
      label: k.slice(5),
      bookings: daily[k].bookings,
      guests: daily[k].guests,
    }));

    const paidTableBookingsArr = tableBookings.filter((x) => String(x.payment_status || "").toUpperCase() === "PAID");
    const table_revenue = paidTableBookingsArr.reduce((sum, x) => sum + Number(x.total_amount || 0), 0);

    const offers_active = offers.filter((o) => Boolean(o.is_active)).length;
    const offers_total = offers.length;

    // Review stats
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const sentiment_counts = { positive: 0, neutral: 0, negative: 0 };
    const ratingNums = [];
    let replied_count = 0;
    let pending_reply_count = 0;

    const reviewsEnriched = reviews.map((r) => {
      const comment = String(r.review_text || "");
      const sentiment = simpleSentiment(comment);
      const rating = r.rating != null ? Number(r.rating) : null;
      const hasRating = rating != null && Number.isFinite(rating);
      const hasReply = Boolean(r.owner_reply_text);

      sentiment_counts[sentiment] = (sentiment_counts[sentiment] || 0) + 1;

      if (hasRating) {
        ratingNums.push(rating);
        const rounded = Math.max(1, Math.min(5, Math.round(rating)));
        dist[rounded] += 1;
      }

      if (hasReply) replied_count += 1;
      else if (comment) pending_reply_count += 1;

      return {
        id: r.id,
        rating: hasRating ? rating : null,
        comment,
        author_name: String(r.username_snapshot || "Anonymous"),
        sentiment,
        has_reply: hasReply,
        created_at: r.created_at,
      };
    });

    const avg_rating = ratingNums.length
      ? ratingNums.reduce((a, c) => a + c, 0) / ratingNums.length
      : null;

    const keywords = topKeywords(
      reviews.map((r) => ({ comment: r.review_text || "" })),
      10
    );

    const review_stats = {
      avg_rating,
      dist,
      sentiment_counts,
      keywords,
      total: reviews.length,
      replied_count,
      pending_reply_count,
    };

    const recent_bookings = bookings.slice(0, 50).map((b) => ({
      id: b.id,
      customer_name: b.customer_name,
      party_size: b.party_size,
      status: b.status,
      source: b.source,
      created_at: b.created_at,
    }));

    const recent_reviews = reviewsEnriched.slice(0, 50);

    return NextResponse.json({
      ok: true,
      booking_series,
      status_counts: statusCounts,
      source_counts: sourceCounts,
      total_guests: totalGuests,
      total_bookings: bookings.length,
      table_revenue,
      paid_table_bookings: paidTableBookingsArr.length,
      total_table_bookings: tableBookings.length,
      offers_active,
      offers_total,
      review_stats,
      recent_bookings,
      recent_reviews,
    });
  } catch (error) {
    return serverError(error);
  }
}
