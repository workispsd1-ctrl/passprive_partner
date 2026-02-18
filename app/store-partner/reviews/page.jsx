"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  MessageSquare,
  Heart,
  Send,
  Loader2,
  Star,
  Store,
} from "lucide-react";

function uid() {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function toIso(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function normalizeReply(r) {
  return {
    id: r?.id || uid(),
    text: String(r?.text || "").trim(),
    author_id: r?.author_id || null,
    author_name: r?.author_name || "Partner",
    created_at: toIso(r?.created_at),
  };
}

function normalizeReview(raw, fallbackStoreId) {
  const likes = Number.isFinite(Number(raw?.likes_count)) ? Number(raw.likes_count) : 0;
  const likedBy = Array.isArray(raw?.liked_by) ? raw.liked_by.map(String) : [];
  const replies = Array.isArray(raw?.replies) ? raw.replies.map(normalizeReply) : [];

  return {
    id: raw?.id || uid(),
    store_id: raw?.store_id || fallbackStoreId,
    author_name: String(raw?.author_name || "Customer"),
    rating: Math.max(1, Math.min(5, Number(raw?.rating || 5))),
    comment: String(raw?.comment || "").trim(),
    created_at: toIso(raw?.created_at),
    likes_count: likes,
    liked_by: likedBy,
    replies,
  };
}

function parseReviewsJson(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
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
  const [savingKey, setSavingKey] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [userId, setUserId] = useState("");
  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("all");

  // storeId -> reviews[]
  const [storeReviews, setStoreReviews] = useState({});
  // storeId -> membership id for current user row (writer row)
  const [writerMemberByStore, setWriterMemberByStore] = useState({});
  // reply draft by reviewId
  const [replyDraft, setReplyDraft] = useState({});

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
        setUserId(uidVal);

        // Stores user owns
        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name,city,owner_user_id")
          .eq("owner_user_id", uidVal);

        if (ownerRes.error) throw ownerRes.error;

        // Store ids user is member of
        const myMemberRes = await supabaseBrowser
          .from("store_members")
          .select("id,store_id,role,user_id")
          .eq("user_id", uidVal);

        if (myMemberRes.error) throw myMemberRes.error;

        const myMemberRows = myMemberRes.data || [];
        const memberStoreIds = myMemberRows.map((r) => r.store_id);

        // Stores from memberships
        let memberStores = [];
        if (memberStoreIds.length) {
          const memberStoresRes = await supabaseBrowser
            .from("stores")
            .select("id,name,city,owner_user_id")
            .in("id", memberStoreIds);

          if (memberStoresRes.error) throw memberStoresRes.error;
          memberStores = memberStoresRes.data || [];
        }

        // Merge store list
        const storesMap = new Map();
        [...(ownerRes.data || []), ...memberStores].forEach((s) =>
          storesMap.set(String(s.id), s)
        );
        const storeList = Array.from(storesMap.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        const accessibleStoreIds = storeList.map((s) => s.id);

        // Load ALL membership rows for accessible stores (important for seeing all reviews)
        let allStoreMemberRows = [];
        if (accessibleStoreIds.length) {
          const allRowsRes = await supabaseBrowser
            .from("store_members")
            .select("id,store_id,user_id,role,reviews")
            .in("store_id", accessibleStoreIds);

          if (allRowsRes.error) throw allRowsRes.error;
          allStoreMemberRows = allRowsRes.data || [];
        }

        const nextStoreReviews = {};
        const nextWriterMap = {};

        // writer rows map (current user's row per store)
        myMemberRows.forEach((row) => {
          nextWriterMap[String(row.store_id)] = row.id;
        });

        // aggregate reviews per store across ALL member rows
        allStoreMemberRows.forEach((row) => {
          const sid = String(row.store_id);
          const arr = parseReviewsJson(row.reviews);
          const normalized = arr.map((r) => normalizeReview(r, sid));

          if (!nextStoreReviews[sid]) nextStoreReviews[sid] = [];
          nextStoreReviews[sid].push(...normalized);
        });

        Object.keys(nextStoreReviews).forEach((sid) => {
          nextStoreReviews[sid] = sortReviewsDesc(dedupeById(nextStoreReviews[sid]));
        });

        if (!cancelled) {
          setStores(storeList);
          setStoreReviews(nextStoreReviews);
          setWriterMemberByStore(nextWriterMap);
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

  const ensureWriterMembershipRow = async (storeId) => {
    const sid = String(storeId);
    const existingId = writerMemberByStore[sid];
    if (existingId) return existingId;

    const targetStore = stores.find((s) => String(s.id) === sid);
    const role = targetStore?.owner_user_id === userId ? "owner" : "manager";

    const ins = await supabaseBrowser
      .from("store_members")
      .insert({
        store_id: sid,
        user_id: userId,
        role,
        reviews: storeReviews[sid] || [],
      })
      .select("id")
      .single();

    if (ins.error) throw ins.error;

    setWriterMemberByStore((prev) => ({ ...prev, [sid]: ins.data.id }));
    return ins.data.id;
  };

  const saveStoreReviews = async (storeId, reviews) => {
    const sid = String(storeId);
    const memberId = await ensureWriterMembershipRow(sid);

    const { error } = await supabaseBrowser
      .from("store_members")
      .update({ reviews })
      .eq("id", memberId);

    if (error) throw error;

    setStoreReviews((prev) => ({
      ...prev,
      [sid]: sortReviewsDesc(reviews),
    }));
  };

  const toggleLike = async (review) => {
    const key = `like_${review.id}`;
    try {
      setSavingKey(key);
      setErr("");
      setOk("");

      const sid = String(review.store_id);
      const current = storeReviews[sid] || [];
      const idx = current.findIndex((r) => String(r.id) === String(review.id));
      if (idx < 0) return;

      const next = [...current];
      const item = { ...next[idx] };
      const likedBy = Array.isArray(item.liked_by) ? [...item.liked_by] : [];
      const already = likedBy.includes(String(userId));

      if (already) {
        item.liked_by = likedBy.filter((x) => String(x) !== String(userId));
        item.likes_count = Math.max(0, Number(item.likes_count || 0) - 1);
      } else {
        item.liked_by = [...likedBy, String(userId)];
        item.likes_count = Number(item.likes_count || 0) + 1;
      }

      next[idx] = item;
      await saveStoreReviews(sid, next);
    } catch (e) {
      setErr(e?.message || "Failed to update like.");
    } finally {
      setSavingKey("");
    }
  };

  const addReply = async (review) => {
    const text = String(replyDraft[review.id] || "").trim();
    if (!text) return;

    const key = `reply_${review.id}`;
    try {
      setSavingKey(key);
      setErr("");
      setOk("");

      const sid = String(review.store_id);
      const current = storeReviews[sid] || [];
      const idx = current.findIndex((r) => String(r.id) === String(review.id));
      if (idx < 0) return;

      const next = [...current];
      const item = { ...next[idx] };
      const replies = Array.isArray(item.replies) ? [...item.replies] : [];

      replies.push({
        id: uid(),
        text,
        author_id: userId,
        author_name: "Partner",
        created_at: new Date().toISOString(),
      });

      item.replies = replies;
      next[idx] = item;

      await saveStoreReviews(sid, next);
      setReplyDraft((prev) => ({ ...prev, [review.id]: "" }));
      setOk("Reply posted.");
    } catch (e) {
      setErr(e?.message || "Failed to post reply.");
    } finally {
      setSavingKey("");
    }
  };

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

        <Card title="Store Reviews" subtitle="View all-store reviews or filter by one store. Reply and like from here.">
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
                    const isLiked = Array.isArray(r.liked_by)
                      ? r.liked_by.includes(String(userId))
                      : false;

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

                          <button
                            type="button"
                            onClick={() => toggleLike(r)}
                            disabled={savingKey === `like_${r.id}`}
                            className={`h-9 rounded-full border px-3 text-sm font-medium inline-flex items-center gap-2 ${
                              isLiked
                                ? "border-pink-200 bg-pink-50 text-pink-700"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {savingKey === `like_${r.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Heart className={`h-4 w-4 ${isLiked ? "fill-pink-600 text-pink-600" : ""}`} />
                            )}
                            {Number(r.likes_count || 0)}
                          </button>
                        </div>

                        <div className="mt-3 text-sm text-gray-800">{r.comment || "-"}</div>

                        {Array.isArray(r.replies) && r.replies.length ? (
                          <div className="mt-3 space-y-2">
                            {r.replies.map((rep) => (
                              <div key={rep.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">
                                  {rep.author_name} • {timeAgo(rep.created_at)}
                                </div>
                                <div className="text-sm text-gray-800 mt-1">{rep.text}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={replyDraft[r.id] || ""}
                            onChange={(e) =>
                              setReplyDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Write a reply..."
                            className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                          />
                          <button
                            type="button"
                            onClick={() => addReply(r)}
                            disabled={savingKey === `reply_${r.id}`}
                            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-2"
                          >
                            {savingKey === `reply_${r.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Reply
                          </button>
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
