"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Reviews are stored in restaurants.reviews (jsonb).
 *
 * Works best with array structure:
 * reviews: [
 *  {
 *    id: "rev_xxx",
 *    userName?: "Rahul",
 *    userAvatar?: "https://...",
 *    rating: 4.5,
 *    food_rating?: 4.0,
 *    service_rating?: 4.5,
 *    ambience_rating?: 4.0,
 *    comment: "Great food...",
 *    images?: string[],
 *    createdAt: "2026-02-04T10:00:00Z",
 *    reply?: { text: "Thanks!", createdAt: "..." }
 *  }
 * ]
 */

function isArray(v) {
  return Array.isArray(v);
}

function normalizeReviews(raw) {
  if (!raw) return [];
  if (isArray(raw)) return raw;

  if (typeof raw === "object") {
    if (isArray(raw.items)) return raw.items;
    if (isArray(raw.reviews)) return raw.reviews;

    // keyed object: {id1:{...}, id2:{...}}
    const vals = Object.values(raw);
    if (vals.length && vals.every((x) => typeof x === "object")) return vals;
  }

  return [];
}

function ensureId(r) {
  if (r?.id) return r;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `rev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return { ...r, id };
}

function toNumber(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

function clamp01to5(v) {
  if (v == null) return undefined;
  return Math.max(0, Math.min(5, v));
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ value }) {
  const v = clamp01to5(value) ?? 0;
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f-${i}`} className="text-amber-500">
          ★
        </span>
      ))}
      {half ? <span className="text-amber-500">☆</span> : null}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e-${i}`} className="text-slate-300">
          ★
        </span>
      ))}
      <span className="ml-2 text-sm text-slate-600">{v.toFixed(1)}</span>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
      {children}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-6 w-64 rounded bg-slate-200" />
            <div className="h-4 w-80 rounded bg-slate-200" />
            <div className="flex gap-2 pt-3">
              <div className="h-7 w-24 rounded-full bg-slate-200" />
              <div className="h-7 w-24 rounded-full bg-slate-200" />
              <div className="h-7 w-24 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
          </div>

          <div className="p-6 space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-5">
                <div className="animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-200" />
                    <div className="space-y-2">
                      <div className="h-4 w-48 rounded bg-slate-200" />
                      <div className="h-3 w-36 rounded bg-slate-200" />
                    </div>
                  </div>
                  <div className="mt-4 h-3 w-full rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-slate-200" />
                  <div className="mt-4 h-10 w-full rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState("");

  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [reviews, setReviews] = useState([]);

  // UI controls
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL"); // ALL | REPLIED | UNREPLIED
  const [minRating, setMinRating] = useState("ALL"); // ALL | 4 | 3 | 2 | 1
  const [sort, setSort] = useState("NEW"); // NEW | OLD | HIGH | LOW

  // reply state
  const [replyOpenId, setReplyOpenId] = useState(null);
  const [replyDraft, setReplyDraft] = useState({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setLastError("");

    const {
      data: { user },
      error: userErr,
    } = await supabaseBrowser.auth.getUser();

    if (userErr) {
      setLastError(userErr.message || "Failed to read session");
      setLoading(false);
      return;
    }

    if (!user) {
      setLastError("You are not logged in.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("restaurants")
      .select("id, name, reviews")
      .eq("owner_user_id", user.id)
      .single();

    if (error) {
      setLastError(error.message || "Failed to load restaurant");
      setLoading(false);
      return;
    }

    setRestaurantId(data.id);
    setRestaurantName(data.name || "");

    const normalized = normalizeReviews(data.reviews)
      .map(ensureId)
      .map((r) => {
        const createdAt = r.createdAt || r.created_at || r.created || r.date;
        const replyObj =
          r.reply && typeof r.reply === "object"
            ? {
                text: String(r.reply.text ?? ""),
                createdAt: String(
                  r.reply.createdAt ?? r.reply.created_at ?? new Date().toISOString()
                ),
              }
            : r.reply_text
            ? {
                text: String(r.reply_text),
                createdAt: String(r.reply_createdAt ?? new Date().toISOString()),
              }
            : null;

        return {
          ...r,
          rating: clamp01to5(toNumber(r.rating)),
          food_rating: clamp01to5(toNumber(r.food_rating)),
          service_rating: clamp01to5(toNumber(r.service_rating)),
          ambience_rating: clamp01to5(toNumber(r.ambience_rating)),
          comment: typeof r.comment === "string" ? r.comment : r.comment?.text || "",
          createdAt: typeof createdAt === "string" ? createdAt : undefined,
          reply: replyObj,
        };
      });

    setReviews(normalized);

    const drafts = {};
    for (const r of normalized) drafts[r.id] = r.reply?.text || "";
    setReplyDraft(drafts);

    setLoading(false);
  }

  async function saveReviews(next) {
    if (!restaurantId) return false;

    setSaving(true);
    setLastError("");

    const payload = next.map((r) => ({
      ...r,
      reply: r.reply ? { text: r.reply.text, createdAt: r.reply.createdAt } : null,
    }));

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ reviews: payload })
      .eq("id", restaurantId);

    if (error) {
      setLastError(error.message || "Failed to save replies");
      setSaving(false);
      return false;
    }

    setSaving(false);
    return true;
  }

  async function upsertReply(reviewId) {
    const text = (replyDraft[reviewId] || "").trim();
    if (!text) return alert("Please type a reply.");

    const next = reviews.map((r) =>
      r.id === reviewId
        ? {
            ...r,
            reply: {
              text,
              createdAt: r.reply?.createdAt || new Date().toISOString(),
            },
          }
        : r
    );

    setReviews(next);
    const ok = await saveReviews(next);
    if (ok) setReplyOpenId(null);
  }

  async function deleteReply(reviewId) {
    const ok = confirm("Remove reply?");
    if (!ok) return;

    const next = reviews.map((r) => (r.id === reviewId ? { ...r, reply: null } : r));
    setReviews(next);
    setReplyDraft((d) => ({ ...d, [reviewId]: "" }));
    await saveReviews(next);
  }

  const stats = useMemo(() => {
    const total = reviews.length;
    const replied = reviews.filter((r) => r.reply?.text?.trim()).length;
    const avg =
      total === 0 ? 0 : reviews.reduce((acc, r) => acc + (r.rating ?? 0), 0) / total;

    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      const rr = Math.round(r.rating || 0);
      if (rr >= 1 && rr <= 5) dist[rr] += 1;
    }

    return { total, replied, avg, dist };
  }, [reviews]);

  const visible = useMemo(() => {
    let list = [...reviews];

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = (r.userName || r.user_name || "Anonymous").toString().toLowerCase();
        const comment = (r.comment || "").toString().toLowerCase();
        const id = (r.id || "").toString().toLowerCase();
        return name.includes(q) || comment.includes(q) || id.includes(q);
      });
    }

    if (filter === "REPLIED") list = list.filter((r) => r.reply?.text?.trim());
    if (filter === "UNREPLIED") list = list.filter((r) => !r.reply?.text?.trim());

    if (minRating !== "ALL") {
      const mr = Number(minRating);
      list = list.filter((r) => (r.rating ?? 0) >= mr);
    }

    if (sort === "NEW") {
      list.sort(
        (a, b) =>
          (new Date(b.createdAt || 0).getTime() || 0) -
          (new Date(a.createdAt || 0).getTime() || 0)
      );
    } else if (sort === "OLD") {
      list.sort(
        (a, b) =>
          (new Date(a.createdAt || 0).getTime() || 0) -
          (new Date(b.createdAt || 0).getTime() || 0)
      );
    } else if (sort === "HIGH") {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sort === "LOW") {
      list.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
    }

    return list;
  }, [reviews, search, filter, minRating, sort]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen ">
      {/* error strip */}
      {lastError ? (
        <div className="max-w-6xl mx-auto px-6 pt-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {lastError}
          </div>
        </div>
      ) : null}

      {/* saving toast */}
      {saving ? (
        <div className="fixed top-4 right-4 z-[80] rounded-xl bg-slate-900 text-white px-4 py-2 text-sm shadow-lg">
          Saving…
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
             
              <h1 className="text-2xl font-semibold text-slate-900 mt-1 truncate">
                Reviews
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill>{stats.total} total</Pill>
                <Pill>{stats.replied} replied</Pill>
                <Pill>Avg {stats.avg.toFixed(1)}</Pill>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 min-w-[260px]">
              <p className="text-xs text-slate-600 mb-2">Average rating</p>
              <Stars value={stats.avg} />
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>5★</span>
                  <span>{stats.dist[5]}</span>
                </div>
                <div className="flex justify-between">
                  <span>4★</span>
                  <span>{stats.dist[4]}</span>
                </div>
                <div className="flex justify-between">
                  <span>3★</span>
                  <span>{stats.dist[3]}</span>
                </div>
                <div className="flex justify-between">
                  <span>2★</span>
                  <span>{stats.dist[2]}</span>
                </div>
                <div className="flex justify-between">
                  <span>1★</span>
                  <span>{stats.dist[1]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name / text / review id…"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="ALL">All</option>
              <option value="UNREPLIED">Unreplied</option>
              <option value="REPLIED">Replied</option>
            </select>

            <div className="grid grid-cols-2 gap-3">
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="ALL">Any rating</option>
                <option value="4">4★+</option>
                <option value="3">3★+</option>
                <option value="2">2★+</option>
                <option value="1">1★+</option>
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="NEW">Newest</option>
                <option value="OLD">Oldest</option>
                <option value="HIGH">Highest</option>
                <option value="LOW">Lowest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reviews list */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">All reviews</p>
            <p className="text-xs text-slate-500">{visible.length} shown</p>
          </div>

          {visible.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">No reviews found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map((r) => {
                const userName = (r.userName || r.user_name || "Anonymous").toString();
                const createdAt = r.createdAt || r.created_at;
                const hasReply = Boolean(r.reply?.text?.trim());

                return (
                  <div key={r.id} className="px-6 py-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-600 text-sm">
                          {r.userAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.userAvatar}
                              alt={userName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span>{userName.slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
                            <span className="text-xs text-slate-500">{formatDate(createdAt)}</span>
                            {hasReply ? (
                              <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">
                                Replied
                              </span>
                            ) : (
                              <span className="text-xs rounded-full bg-amber-50 text-amber-700 px-2 py-1">
                                Awaiting reply
                              </span>
                            )}
                          </div>

                          <div className="mt-2">
                            <Stars value={r.rating} />
                          </div>

                          {(r.food_rating || r.service_rating || r.ambience_rating) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {r.food_rating != null ? (
                                <Pill>Food {Number(r.food_rating).toFixed(1)}</Pill>
                              ) : null}
                              {r.service_rating != null ? (
                                <Pill>Service {Number(r.service_rating).toFixed(1)}</Pill>
                              ) : null}
                              {r.ambience_rating != null ? (
                                <Pill>Ambience {Number(r.ambience_rating).toFixed(1)}</Pill>
                              ) : null}
                            </div>
                          ) : null}

                          {r.comment ? (
                            <p className="mt-4 text-sm text-slate-700 whitespace-pre-line">{r.comment}</p>
                          ) : (
                            <p className="mt-4 text-sm text-slate-500">No comment provided.</p>
                          )}

                          {Array.isArray(r.images) && r.images.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {r.images.slice(0, 6).map((url, idx) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={idx}
                                  src={url}
                                  alt="review"
                                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setReplyOpenId((prev) => (prev === r.id ? null : r.id));
                            setReplyDraft((d) => ({
                              ...d,
                              [r.id]: d[r.id] ?? (r.reply?.text ?? ""),
                            }));
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {replyOpenId === r.id ? "Close" : hasReply ? "Edit reply" : "Reply"}
                        </button>

                        {hasReply ? (
                          <button
                            onClick={() => deleteReply(r.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 hover:bg-rose-100"
                          >
                            Delete reply
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {replyOpenId === r.id ? (
                      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs text-slate-600 mb-2">Your reply</p>

                        <textarea
                          rows={4}
                          value={replyDraft[r.id] ?? ""}
                          onChange={(e) =>
                            setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))
                          }
                          placeholder="Write a professional reply…"
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                        />

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            Replies are saved to <b>restaurants.reviews</b> (jsonb).
                          </p>

                          <button
                            disabled={saving}
                            onClick={() => upsertReply(r.id)}
                            className="rounded-xl bg-[#DA3224] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? "Saving…" : "Save reply"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {hasReply && replyOpenId !== r.id ? (
                      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-900">Your reply</p>
                          <p className="text-xs text-slate-500">{formatDate(r.reply?.createdAt)}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">
                          {r.reply?.text}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        
      </div>
    </div>
  );
}
