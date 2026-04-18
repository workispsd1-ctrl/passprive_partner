"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  MessageSquare,
  Heart,
  Star,
  Store,
} from "lucide-react";
import { fetchMyStores } from "@/lib/store-partner/stores";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function toIso(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function normalizeReview(raw, fallbackStoreId) {
  return {
    id: raw?.id || uid(),
    store_id: raw?.store_id || fallbackStoreId,
    author_name: String(raw?.username_snapshot || raw?.author_name || "Customer"),
    rating: Math.max(1, Math.min(5, Number(raw?.rating || 5))),
    comment: String(raw?.review_text || raw?.comment || "").trim(),
    created_at: toIso(raw?.created_at),
    likes_count: 0,
    liked_by: [],
    replies: [],
  };
}

function dedupeById(reviews) {
  const map = new Map();
  reviews.forEach((r) => map.set(String(r.id), r));
  return Array.from(map.values());
}

function sortReviewsDesc(list) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function timeAgo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  const diff = Date.now() - d.getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="font-semibold text-gray-900">{title}</div>
        {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= rating ? "text-amber-500 fill-amber-500" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("all");

  const [storeReviews, setStoreReviews] = useState({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setOk("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        const uidVal = sess?.session?.user?.id;

        if (!uidVal) {
          router.replace("/sign-in");
          return;
        }
        if (cancelled) return;

        const storeList = (await fetchMyStores()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        const accessibleStoreIds = storeList.map((s) => s.id);

        const nextStoreReviews = {};

        if (accessibleStoreIds.length) {
          const reviewsRes = await supabaseBrowser
            .from("store_reviews")
            .select("id,store_id,rating,review_text,username_snapshot,created_at,is_approved")
            .in("store_id", accessibleStoreIds)
            .eq("is_approved", true)
            .order("created_at", { ascending: false });

          if (reviewsRes.error) throw reviewsRes.error;

          (reviewsRes.data || []).forEach((row) => {
            const sid = String(row.store_id);
            if (!nextStoreReviews[sid]) nextStoreReviews[sid] = [];
            nextStoreReviews[sid].push(normalizeReview(row, sid));
          });
        }

        Object.keys(nextStoreReviews).forEach((sid) => {
          nextStoreReviews[sid] = sortReviewsDesc(dedupeById(nextStoreReviews[sid]));
        });

        if (!cancelled) {
          setStores(storeList);
          setStoreReviews(nextStoreReviews);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load reviews.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const storeNameById = useMemo(() => {
    const m = {};
    stores.forEach((s) => {
      m[String(s.id)] = s.name;
    });
    return m;
  }, [stores]);

  const allReviews = useMemo(() => {
    const rows = [];
    Object.entries(storeReviews).forEach(([sid, reviews]) => {
      (reviews || []).forEach((r) => rows.push({ ...r, store_id: sid }));
    });
    return sortReviewsDesc(rows);
  }, [storeReviews]);

  const visibleReviews = useMemo(() => {
    if (storeFilter === "all") return allReviews;
    return allReviews.filter((r) => String(r.store_id) === String(storeFilter));
  }, [allReviews, storeFilter]);

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/store-partner/dashboard")}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        <Card title="Store Reviews" subtitle="View all store reviews from the new review table. Reply and like controls are unavailable in this schema.">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-28 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-28 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-w-sm">
                <div className="text-xs font-semibold text-gray-600 mb-2">Filter Store</div>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  <option value="all">All Stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {!visibleReviews.length ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <MessageSquare className="h-5 w-5 text-gray-500 mx-auto" />
                  <div className="mt-2 text-sm text-gray-600">No reviews found.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleReviews.map((r) => {
                    return (
                      <div key={r.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{r.author_name}</div>
                            <div className="mt-1">
                              <Stars rating={r.rating} />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {timeAgo(r.created_at)}
                              <span className="mx-2 text-gray-300">|</span>
                              <span className="inline-flex items-center gap-1">
                                <Store className="h-3.5 w-3.5" />
                                {storeNameById[String(r.store_id)] || "Store"}
                              </span>
                            </div>
                          </div>

                          <div className="h-9 rounded-full border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-500 inline-flex items-center gap-2">
                            <Heart className="h-4 w-4" />
                            Likes unavailable
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-gray-800">{r.comment || "-"}</div>

                        <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                          Partner replies are not stored in the current `store_reviews` schema.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
