"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* =======================================================
   Trendy UI helpers (glass + sections + charts)
======================================================= */
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

function Chip({ children, tone = "slate" }) {
  const map = {
    slate: "bg-white/70 text-slate-700 border-white/60",
    emerald: "bg-emerald-50/70 text-emerald-700 border-emerald-200/60",
    amber: "bg-amber-50/70 text-amber-700 border-amber-200/60",
    rose: "bg-rose-50/70 text-rose-700 border-rose-200/60",
    indigo: "bg-indigo-50/70 text-indigo-700 border-indigo-200/60",
    violet: "bg-violet-50/70 text-violet-700 border-violet-200/60",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs backdrop-blur ${
        map[tone] || map.slate
      }`}
    >
      {children}
    </span>
  );
}

function GlassCard({ title, sub, right, children }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_10px_40px_-18px_rgba(0,0,0,0.25)] overflow-hidden">
      <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {sub ? <p className="text-xs text-slate-500 mt-1">{sub}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SoftButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm text-slate-700 backdrop-blur hover:bg-white/90 active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-[#DA3224] px-4 py-2 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] transition shadow-[0_12px_30px_-16px_rgba(218,50,36,0.8)]"
    >
      {children}
    </button>
  );
}

function DividerLabel({ label, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      {right ? right : null}
    </div>
  );
}

/* =======================================================
   Tiny chart components (no external libs)
======================================================= */
function BarStack({ segments }) {
  // segments: [{pct, className, title}]
  return (
    <div className="h-2 w-full rounded-full bg-white/60 overflow-hidden">
      <div className="h-2 w-full flex">
        {segments.map((s, idx) => (
          <div
            key={idx}
            className={s.className}
            style={{ width: `${Math.max(0, Math.min(100, s.pct))}%` }}
            title={s.title}
          />
        ))}
      </div>
    </div>
  );
}

function MiniBars({ points, height = 140, barWidth = 10 }) {
  const max = Math.max(1, ...points.map((p) => p.value || 0));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {points.map((p) => {
        const h = Math.round(((p.value || 0) / max) * height);
        return (
          <div key={p.key} className="flex flex-col items-center gap-2">
            <div
              className="rounded-xl bg-[#DA3224]/85"
              style={{ width: `${barWidth}px`, height: `${Math.max(6, h)}px` }}
              title={`${p.label}: ${p.value}`}
            />
            <span className="text-[10px] text-slate-500">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ items, size = 160 }) {
  // items: [{label, value, color}] - color is css var or tailwind not allowed inline classes for conic?
  const total = items.reduce((a, x) => a + (x.value || 0), 0) || 1;

  // build conic gradient
  let acc = 0;
  const stops = items
    .map((x) => {
      const start = (acc / total) * 100;
      acc += x.value || 0;
      const end = (acc / total) * 100;
      return `${x.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");

  const ringStyle = {
    width: size,
    height: size,
    background: `conic-gradient(${stops})`,
  };

  return (
    <div className="flex items-center gap-5">
      <div className="relative rounded-full" style={ringStyle}>
        <div className="absolute inset-4 rounded-full bg-white/80 backdrop-blur" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-xl font-semibold text-slate-900">{total === 1 && items.every((x) => !x.value) ? "0" : total}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((x) => {
          const pct = Math.round(((x.value || 0) / total) * 100);
          return (
            <div key={x.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                <span className="text-slate-700">{x.label}</span>
              </div>
              <span className="text-slate-500">
                {x.value || 0} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineArea({ points, height = 160 }) {
  // points: [{xLabel, y}]
  const ys = points.map((p) => Number(p.y) || 0);
  const max = Math.max(1, ...ys);
  const min = Math.min(0, ...ys);

  // create SVG path
  const w = Math.max(520, points.length * 18);
  const h = height;

  const xStep = points.length > 1 ? w / (points.length - 1) : w;
  const scaleY = (v) => {
    const t = (v - min) / (max - min || 1);
    return h - t * h;
  };

  const d = points
    .map((p, i) => {
      const x = i * xStep;
      const y = scaleY(Number(p.y) || 0);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const area = `${d} L ${(w).toFixed(2)} ${h} L 0 ${h} Z`;

  return (
    <div className="overflow-x-auto">
      <svg width={w} height={h + 26} className="block">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(218,50,36,0.35)" />
            <stop offset="100%" stopColor="rgba(218,50,36,0.02)" />
          </linearGradient>
        </defs>

        {/* area */}
        <path d={area} fill="url(#areaGrad)" />
        {/* line */}
        <path d={d} fill="none" stroke="rgba(218,50,36,0.9)" strokeWidth="3" />

        {/* points */}
        {points.map((p, i) => {
          const x = i * xStep;
          const y = scaleY(Number(p.y) || 0);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" fill="rgba(218,50,36,0.95)" />
            </g>
          );
        })}

        {/* x labels */}
        {points.map((p, i) => {
          if (points.length > 24 && i % 3 !== 0) return null;
          const x = i * xStep;
          return (
            <text
              key={`t-${i}`}
              x={x}
              y={h + 18}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(100,116,139,0.9)"
            >
              {p.xLabel}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* =======================================================
   Date + analysis helpers
======================================================= */
function safeDate(d) {
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDay(d) {
  return startOfDay(d).toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}
function fmtDate(d) {
  const x = safeDate(d);
  if (!x) return "—";
  return x.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
function fmtTime(d) {
  const x = safeDate(d);
  if (!x) return "—";
  return x.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function minutesBetween(a, b) {
  const da = safeDate(a);
  const db = safeDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 60000);
}

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
    const words = tokenize(r?.comment || r?.text || "");
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

function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat().format(v);
}

/* =======================================================
   Page
======================================================= */
export default function page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantRow, setRestaurantRow] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [paymentDetails, setPaymentDetails] = useState(null);

  // UI controls
  const [range, setRange] = useState("30"); // 7 | 30 | 90 | all
  const [search, setSearch] = useState("");

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: uErr,
    } = await supabaseBrowser.auth.getUser();

    if (uErr) {
      setError(uErr.message || "Failed to get user");
      setLoading(false);
      return;
    }
    if (!user) {
      setError("You are not logged in.");
      setLoading(false);
      return;
    }

    const { data: rData, error: rErr } = await supabaseBrowser
      .from("restaurants")
      .select("id, rating, total_ratings, food_rating, service_rating, ambience_rating, reviews, offer, menu, booking_enabled, created_at")
      .eq("owner_user_id", user.id)
      .single();

    if (rErr) {
      setError(rErr.message || "Failed to load restaurant");
      setLoading(false);
      return;
    }

    const rid = rData?.id;
    setRestaurantId(rid);
    setRestaurantRow(rData || null);

    const { data: pData } = await supabaseBrowser
      .from("restaurant_payment_details")
      .select("restaurant_id, payout_method, settlement_cycle, commission_percent, currency, kyc_status, billing_email, billing_phone, updated_at")
      .eq("restaurant_id", rid)
      .maybeSingle();

    setPaymentDetails(pData || null);

    const { data: bData, error: bErr } = await supabaseBrowser
      .from("restaurant_bookings")
      .select("id, customer_user_id, customer_name, customer_phone, customer_email, booking_date, booking_time, duration_minutes, party_size, status, source, cancelled_at, cancel_reason, created_at, updated_at, read")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (bErr) {
      setError(bErr.message || "Failed to load bookings");
      setLoading(false);
      return;
    }

    const rows = Array.isArray(bData) ? bData : [];
    setBookings(rows);

    const ids = Array.from(new Set(rows.map((x) => x.customer_user_id).filter(Boolean)));
    if (ids.length) {
      const { data: uData } = await supabaseBrowser
        .from("users")
        .select("id, full_name, email, phone, membership_tier, membership, created_at, last_opened, last_login, device_type, device_os, app_version")
        .in("id", ids)
        .limit(2000);

      const map = {};
      (uData || []).forEach((u) => (map[u.id] = u));
      setUserMap(map);
    } else {
      setUserMap({});
    }

    setLoading(false);
  }

  /* =======================================================
     Filtered (range + search) WITHOUT top KPI cards
  ======================================================= */
  const filtered = useMemo(() => {
    if (!restaurantRow) return { bookings: [], reviews: [] };

    // bookings by range
    const byRangeBookings = (() => {
      if (range === "all") return bookings;
      const days = Number(range);
      const from = daysAgo(days - 1);
      return bookings.filter((b) => {
        const d = safeDate(b.created_at);
        return d ? d >= from : false;
      });
    })();

    const q = search.trim().toLowerCase();
    const bySearchBookings = !q
      ? byRangeBookings
      : byRangeBookings.filter((b) => {
          const u = b.customer_user_id ? userMap[b.customer_user_id] : null;
          const hay = `${b.customer_name || ""} ${b.customer_phone || ""} ${b.customer_email || ""} ${b.status || ""} ${b.source || ""} ${
            u?.full_name || ""
          } ${u?.email || ""} ${u?.phone || ""}`.toLowerCase();
          return hay.includes(q);
        });

    // reviews (jsonb)
    const rawReviews = Array.isArray(restaurantRow.reviews) ? restaurantRow.reviews : [];
    const reviewsEnriched = rawReviews
      .map((r, idx) => {
        const createdAt = r?.createdAt || r?.created_at || r?.date || null;
        const replyAt = r?.reply?.createdAt || r?.reply?.created_at || null;
        const rating = Number(r?.rating);
        const hasRating = Number.isFinite(rating);
        const comment = r?.comment ?? r?.text ?? "";
        const sentiment = simpleSentiment(comment);
        return {
          _idx: idx,
          ...r,
          createdAt,
          replyAt,
          rating: hasRating ? rating : null,
          comment,
          sentiment,
          hasReply: Boolean(r?.reply?.text),
          responseMinutes:
            createdAt && replyAt && minutesBetween(createdAt, replyAt) != null
              ? minutesBetween(createdAt, replyAt)
              : null,
          authorName: r?.author?.name || r?.user?.name || r?.name || "Anonymous",
        };
      })
      .sort((a, b) => (safeDate(b.createdAt)?.getTime() || 0) - (safeDate(a.createdAt)?.getTime() || 0));

    const byRangeReviews = (() => {
      if (range === "all") return reviewsEnriched;
      const days = Number(range);
      const from = daysAgo(days - 1);
      return reviewsEnriched.filter((r) => {
        const d = safeDate(r.createdAt);
        return d ? d >= from : false;
      });
    })();

    const bySearchReviews = !q
      ? byRangeReviews
      : byRangeReviews.filter((r) => {
          const hay = `${r.authorName} ${r.comment} ${r?.reply?.text || ""}`.toLowerCase();
          return hay.includes(q);
        });

    return { bookings: bySearchBookings, reviews: bySearchReviews };
  }, [range, search, bookings, userMap, restaurantRow]);

  /* =======================================================
     Analytics (graphs + modern layout)
  ======================================================= */
  const analytics = useMemo(() => {
    if (!restaurantRow) return null;

    const b = filtered.bookings;
    const r = filtered.reviews;

    // booking status
    const statusCounts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    const sourceCounts = {};
    let totalGuests = 0;

    // series window
    const seriesDays = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : 30;

    const daily = {};
    const base = startOfDay(new Date());
    for (let i = seriesDays - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      daily[isoDay(d)] = { bookings: 0, guests: 0, completed: 0, cancelled: 0 };
    }

    for (const x of b) {
      const st = String(x.status || "pending").toLowerCase();
      if (statusCounts[st] != null) statusCounts[st] += 1;

      const src = x.source || "app";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      const ps = Number(x.party_size);
      if (Number.isFinite(ps)) totalGuests += ps;

      const d = safeDate(x.created_at);
      const key = d ? isoDay(d) : null;
      if (key && daily[key]) {
        daily[key].bookings += 1;
        daily[key].guests += Number.isFinite(ps) ? ps : 0;
        if (st === "completed") daily[key].completed += 1;
        if (st === "cancelled") daily[key].cancelled += 1;
      }
    }

    const bookingSeries = Object.keys(daily).map((k) => ({
      day: k,
      label: k.slice(5),
      bookings: daily[k].bookings,
      guests: daily[k].guests,
      completed: daily[k].completed,
      cancelled: daily[k].cancelled,
    }));

    const maxBookings = Math.max(1, ...bookingSeries.map((x) => x.bookings));
    const maxGuests = Math.max(1, ...bookingSeries.map((x) => x.guests));

    // reviews summary (for charts)
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let replied = 0;
    let pendingReply = 0;

    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };

    const ratingNums = [];
    const responseTimes = [];

    for (const x of r) {
      if (x.hasReply) replied += 1;
      if (x.comment && !x.hasReply) pendingReply += 1;

      sentimentCounts[x.sentiment] = (sentimentCounts[x.sentiment] || 0) + 1;

      if (Number.isFinite(x.rating)) {
        ratingNums.push(x.rating);
        const rounded = Math.max(1, Math.min(5, Math.round(x.rating)));
        dist[rounded] += 1;
      }
      if (Number.isFinite(x.responseMinutes) && x.responseMinutes >= 0) {
        responseTimes.push(x.responseMinutes);
      }
    }

    const avgReviewRating = ratingNums.length ? ratingNums.reduce((a, c) => a + c, 0) / ratingNums.length : null;
    const replyRate = r.length ? Math.round((replied / r.length) * 100) : 0;
    const avgResponseMin = responseTimes.length ? Math.round(responseTimes.reduce((a, c) => a + c, 0) / responseTimes.length) : null;

    // keywords
    const keywords = topKeywords(r, 10);

    // offers/menu quick chips (not KPI cards)
    const offerRaw = restaurantRow.offer;
    const offers = Array.isArray(offerRaw) ? offerRaw : offerRaw && typeof offerRaw === "object" ? [offerRaw] : [];
    const offersTotal = offers.length;
    const offersActive = offers.filter((o) => o && o.isActive !== false).length;

    // dish discounts
    const menu = restaurantRow.menu || {};
    const sections = Array.isArray(menu.sections) ? menu.sections : [];
    let dishTotal = 0;
    let dishActive = 0;
    for (const s of sections) {
      const items = Array.isArray(s?.items) ? s.items : [];
      for (const it of items) {
        dishTotal += 1;
        const has = it && it.discount_percent != null && it.discount_percent !== "";
        if (has && it.discount_active !== false) dishActive += 1;
      }
    }

    // payout config (no transaction analytics without a payouts table)
    const currency = paymentDetails?.currency || "MUR";
    const kyc = paymentDetails?.kyc_status || "NOT_STARTED";
    const commissionPct =
      paymentDetails?.commission_percent != null ? Number(paymentDetails.commission_percent) : null;

    return {
      // graphs
      bookingSeries,
      maxBookings,
      maxGuests,

      // booking breakdown
      statusCounts,
      sourceCounts,
      totalGuests,

      // review breakdown
      dist,
      sentimentCounts,
      replied,
      pendingReply,
      replyRate,
      avgReviewRating,
      avgResponseMin,
      keywords,

      // chips
      offersActive,
      offersTotal,
      dishActive,
      dishTotal,

      // payout config
      currency,
      kyc,
      commissionPct,
      payout_method: paymentDetails?.payout_method || "—",
      settlement_cycle: paymentDetails?.settlement_cycle || "—",
      updated_at: paymentDetails?.updated_at || null,
    };
  }, [restaurantRow, filtered, range, paymentDetails]);

  /* =======================================================
     Loading / Error
  ======================================================= */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[340px]" />
            <Skeleton className="h-[340px]" />
          </div>
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }

  if (error || !restaurantRow || !analytics) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
            <p className="text-sm font-semibold text-rose-800">Unable to load analytics</p>
            <p className="mt-2 text-sm text-rose-700">{error || "No restaurant found."}</p>
            <PrimaryButton onClick={bootstrap}>Retry</PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  const a = analytics;

  // Chart data
  const bookingsBars = a.bookingSeries.map((x) => ({
    key: x.day,
    label: x.label,
    value: x.bookings,
  }));

  const guestsLine = a.bookingSeries.map((x) => ({
    xLabel: x.label,
    y: x.guests,
  }));

  const reviewsDonut = [
    { label: "5★", value: a.dist[5], color: "rgba(34,197,94,0.9)" },
    { label: "4★", value: a.dist[4], color: "rgba(132,204,22,0.9)" },
    { label: "3★", value: a.dist[3], color: "rgba(245,158,11,0.9)" },
    { label: "2★", value: a.dist[2], color: "rgba(249,115,22,0.9)" },
    { label: "1★", value: a.dist[1], color: "rgba(239,68,68,0.9)" },
  ];

  const sentimentDonut = [
    { label: "Positive", value: a.sentimentCounts.positive || 0, color: "rgba(34,197,94,0.9)" },
    { label: "Neutral", value: a.sentimentCounts.neutral || 0, color: "rgba(100,116,139,0.9)" },
    { label: "Negative", value: a.sentimentCounts.negative || 0, color: "rgba(239,68,68,0.9)" },
  ];

  // Booking status stack
  const totalBookings = bookingsBars.reduce((s, x) => s + (x.value || 0), 0) || 0;
  const pct = (n) => (totalBookings ? (n / totalBookings) * 100 : 0);

  /* =======================================================
     UI (Trendy + graphs + no KPI cards row)
  ======================================================= */
  return (
    <div className="min-h-screen ">
      {/* Ambient gradient header */}
      <div className="relative overflow-hidden">
        

        <div className="relative max-w-6xl mx-auto px-6 pt-8 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
             
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone="amber">
                  Offers {a.offersActive}/{a.offersTotal}
                </Chip>
                <Chip tone="indigo">
                  Dish discounts {a.dishActive}/{a.dishTotal}
                </Chip>
                <Chip tone="violet">KYC: {a.kyc}</Chip>
                <Chip tone="slate">
                  Payout: {a.payout_method} • {a.settlement_cycle}
                </Chip>
                {a.commissionPct != null ? (
                  <Chip tone="slate">Commission: {a.commissionPct}%</Chip>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center gap-2 ">
                <span className="text-xs text-slate-500">Range</span>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  className="rounded-2xl bg-white/70 px-3 py-2 text-sm outline-none backdrop-blur "
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bookings / reviews…"
                className="w-full sm:w-64 rounded-2xl border border-gray-300 bg-white/70 px-3 py-2 text-sm outline-none backdrop-blur focus:ring-2 focus:ring-slate-200"
              />

              
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 pb-10 space-y-4">
        {/* Row 1: Bookings volume + Guests line */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard
            title="Bookings volume"
            sub="Daily booking count (selected range)"
            right={<Chip tone="slate">{range === "all" ? "Last 30 shown" : `Last ${range} days`}</Chip>}
          >
            <MiniBars points={bookingsBars} height={150} barWidth={10} />
            <div className="mt-5">
              <DividerLabel
                label="Booking status mix"
                right={<span className="text-xs text-slate-500">Total: {fmtNum(totalBookings)}</span>}
              />
              <div className="mt-3">
                <BarStack
                  segments={[
                    {
                      pct: pct(a.statusCounts.confirmed),
                      className: "bg-emerald-500/80",
                      title: `Confirmed: ${a.statusCounts.confirmed}`,
                    },
                    {
                      pct: pct(a.statusCounts.pending),
                      className: "bg-amber-500/80",
                      title: `Pending: ${a.statusCounts.pending}`,
                    },
                    {
                      pct: pct(a.statusCounts.completed),
                      className: "bg-indigo-500/80",
                      title: `Completed: ${a.statusCounts.completed}`,
                    },
                    {
                      pct: pct(a.statusCounts.cancelled),
                      className: "bg-rose-500/80",
                      title: `Cancelled: ${a.statusCounts.cancelled}`,
                    },
                    {
                      pct: pct(a.statusCounts.no_show),
                      className: "bg-slate-500/70",
                      title: `No-show: ${a.statusCounts.no_show}`,
                    },
                  ]}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Chip tone="emerald">Confirmed: {fmtNum(a.statusCounts.confirmed)}</Chip>
                <Chip tone="amber">Pending: {fmtNum(a.statusCounts.pending)}</Chip>
                <Chip tone="indigo">Completed: {fmtNum(a.statusCounts.completed)}</Chip>
                <Chip tone="rose">Cancelled: {fmtNum(a.statusCounts.cancelled)}</Chip>
                <Chip tone="slate">No-show: {fmtNum(a.statusCounts.no_show)}</Chip>
              </div>
            </div>
          </GlassCard>

          <GlassCard title="Guests trend" sub="Daily guests (party size sum)">
            <LineArea points={guestsLine} height={170} />
            <div className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="slate">Total guests: {fmtNum(a.totalGuests)}</Chip>
                <Chip tone="slate">
                  Peak guests/day: {fmtNum(Math.max(0, ...a.bookingSeries.map((x) => x.guests || 0)))}
                </Chip>
                <Chip tone="slate">Max bookings/day: {fmtNum(a.maxBookings)}</Chip>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                (Guests trend is derived from booking party sizes.)
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Row 2: Reviews donuts + Sentiment + Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard
            title="Review rating distribution"
            sub="Stars split from reviews (selected range)"
            right={
              <Chip tone="slate">
                Avg: {a.avgReviewRating == null ? "—" : `${a.avgReviewRating.toFixed(1)}★`}
              </Chip>
            }
          >
            <Donut items={reviewsDonut} size={170} />
          </GlassCard>

          <GlassCard
            title="Sentiment & reply health"
            sub="Basic sentiment + reply rate"
            right={<Chip tone="slate">Reply rate: {fmtNum(a.replyRate)}%</Chip>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Donut items={sentimentDonut} size={160} />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/60 bg-white/60 p-4">
                  <p className="text-xs text-slate-500">Replies</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    Replied: {fmtNum(a.replied)} • Pending: {fmtNum(a.pendingReply)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Avg response: {a.avgResponseMin == null ? "—" : `${fmtNum(a.avgResponseMin)} min`}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/60 bg-white/60 p-4">
                  <p className="text-xs text-slate-500">Top keywords</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.keywords.length ? (
                      a.keywords.slice(0, 10).map((k) => (
                        <Chip key={k.w} tone="slate">
                          {k.w} · {k.c}
                        </Chip>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No keywords yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Row 3: Booking sources + Recent activity (compact) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard title="Booking sources" sub="Where bookings are coming from">
            {Object.keys(a.sourceCounts).length ? (
              <div className="space-y-4">
                {Object.entries(a.sourceCounts)
                  .sort((x, y) => Number(y[1]) - Number(x[1]))
                  .map(([k, v]) => {
                    const pctv = totalBookings ? (Number(v) / totalBookings) * 100 : 0;
                    return (
                      <div key={k} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700">{k}</span>
                          <span className="text-slate-500">
                            {fmtNum(v)} ({Math.round(pctv)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/60">
                          <div className="h-2 rounded-full bg-[#DA3224]/80" style={{ width: `${pctv}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No sources found.</div>
            )}
          </GlassCard>

          <GlassCard
            title="Recent activity"
            sub="Latest 10 bookings + latest 6 reviews"
            right={
              <PrimaryButton
                onClick={() => {
                  const payload = {
                    range,
                    search,
                    restaurant_id: restaurantId,
                    bookings: filtered.bookings,
                    reviews: filtered.reviews,
                    payment_details: paymentDetails,
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const aTag = document.createElement("a");
                  aTag.href = url;
                  aTag.download = "restaurant_analytics.json";
                  aTag.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export JSON
              </PrimaryButton>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* bookings */}
              <div className="rounded-2xl border border-white/60 bg-white/60 p-4">
                <p className="text-sm font-semibold text-slate-900">Bookings</p>
                <div className="mt-3 space-y-3">
                  {filtered.bookings.slice(0, 10).map((x) => {
                    const st = String(x.status || "pending").toLowerCase();
                    const tone =
                      st === "confirmed"
                        ? "emerald"
                        : st === "pending"
                        ? "amber"
                        : st === "completed"
                        ? "indigo"
                        : st === "cancelled"
                        ? "rose"
                        : "slate";
                    return (
                      <div key={x.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-900 truncate">{x.customer_name || "—"}</p>
                          <p className="text-xs text-slate-500">
                            {fmtDate(x.created_at)} • {fmtTime(x.created_at)} • Party {x.party_size}
                          </p>
                        </div>
                        <Chip tone={tone}>{st.replace("_", " ")}</Chip>
                      </div>
                    );
                  })}
                  {filtered.bookings.length === 0 ? (
                    <p className="text-sm text-slate-500">No bookings in this range.</p>
                  ) : null}
                </div>
              </div>

              {/* reviews */}
              <div className="rounded-2xl border border-white/60 bg-white/60 p-4">
                <p className="text-sm font-semibold text-slate-900">Reviews</p>
                <div className="mt-3 space-y-3">
                  {filtered.reviews.slice(0, 6).map((rv) => {
                    const sTone =
                      rv.sentiment === "positive" ? "emerald" : rv.sentiment === "negative" ? "rose" : "slate";
                    return (
                      <div key={`${rv._idx}-${rv.createdAt || ""}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-slate-900 truncate">{rv.authorName}</p>
                          <div className="flex items-center gap-2">
                            <Chip tone="slate">{rv.rating == null ? "—" : `${rv.rating.toFixed(1)}★`}</Chip>
                            <Chip tone={sTone}>{rv.sentiment}</Chip>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{rv.comment || "—"}</p>
                        {rv.hasReply ? (
                          <p className="text-[11px] text-slate-500">
                            Replied • {rv.reply?.text}
                          </p>
                        ) : (
                          <p className="text-[11px] text-rose-600">Pending reply</p>
                        )}
                      </div>
                    );
                  })}
                  {filtered.reviews.length === 0 ? (
                    <p className="text-sm text-slate-500">No reviews in this range.</p>
                  ) : null}
                </div>
              </div>
            </div>

        
           
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
