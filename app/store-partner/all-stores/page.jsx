"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Plus,
  Download,
  Search,
  Filter,
  Store,
  MapPin,
  Star,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

function CardShell({ title, right, children, subtle = false }) {
  return (
    <div
      className={`rounded-3xl border ${
        subtle ? "border-gray-100 bg-white/70" : "border-gray-200 bg-white"
      } shadow-sm`}
    >
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-gray-900">{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Pill({ children, tone = "gray" }) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function StatMini({ title, value, icon: Icon, tone = "slate" }) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
        </div>
        <div
          className={`h-11 w-11 rounded-2xl border flex items-center justify-center ${
            toneMap[tone] || toneMap.slate
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gray-100 border border-gray-200 ${className}`}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-gray-100 animate-pulse">
      <div className="flex items-center gap-3 w-full">
        <SkeletonBlock className="h-10 w-10" />
        <div className="space-y-2 w-full">
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      </div>
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-6 w-24" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-20" />
        <SkeletonBlock className="h-8 w-24" />
      </div>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

export default function StorePartnerAllStoresPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [stores, setStores] = useState([]);

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFetchErr("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sess?.session?.user?.id;
        if (!userId) {
          router.replace("/sign-in");
          return;
        }

        const { data, error } = await supabaseBrowser
          .from("stores")
          .select(
            "id,name,city,category,is_active,is_featured,updated_at,created_at,slug,region,country,postal_code"
          )
          .eq("owner_user_id", userId)
          .order("updated_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) setStores(data || []);
      } catch (e) {
        if (!cancelled) {
          setFetchErr(e?.message || "Failed to load stores");
          setStores([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const cities = useMemo(() => {
    const set = new Set((stores || []).map((s) => s.city).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [stores]);

  const categories = useMemo(() => {
    const set = new Set((stores || []).map((s) => s.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stores || []).filter((s) => {
      const isFeatured = !!s.is_featured;
      const isActive = s.is_active !== false;

      if (featuredOnly && !isFeatured) return false;
      if (city !== "all" && String(s.city || "") !== city) return false;
      if (category !== "all" && String(s.category || "") !== category) return false;

      if (status !== "all") {
        if (status === "active" && !isActive) return false;
        if (status === "inactive" && isActive) return false;
      }

      if (!q) return true;

      const name = String(s.name || "").toLowerCase();
      const c = String(s.city || "").toLowerCase();
      const cat = String(s.category || "").toLowerCase();
      const reg = String(s.region || "").toLowerCase();

      return name.includes(q) || c.includes(q) || cat.includes(q) || reg.includes(q);
    });
  }, [stores, search, city, category, status, featuredOnly]);

  const kpis = useMemo(() => {
    const total = (stores || []).length;
    const active = (stores || []).filter((s) => s.is_active !== false).length;
    const featured = (stores || []).filter((s) => !!s.is_featured).length;
    const products = "—";
    return { total, active, featured, products };
  }, [stores]);

  const onAddStore = () => {
    router.push("/store-partner/all-stores/add");
  };

  const onView = (storeId) => {
    router.push(`/store-partner/all-stores/${storeId}`);
  };

  const onEdit = (storeId) => {
    router.push(`/store-partner/all-stores/${storeId}/edit`);
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
           
          </div>

          <div className="flex items-center gap-2">
            <button
              className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 shadow-sm"
              type="button"
              onClick={() => alert("Export: wire this later")}
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            <button
              className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-orange-200"
              style={{
                background:
                  "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
              }}
              type="button"
              onClick={onAddStore}
            >
              <Plus className="h-4 w-4" />
              Add Store
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
            </>
          ) : (
            <>
              <StatMini title="Total Stores" value={String(kpis.total)} icon={Store} tone="indigo" />
              <StatMini title="Active Stores" value={String(kpis.active)} icon={CheckCircle2} tone="emerald" />
              <StatMini title="Featured" value={String(kpis.featured)} icon={Star} tone="orange" />
              <StatMini title="Products" value={String(kpis.products)} icon={Filter} tone="slate" />
            </>
          )}
        </div>

        {/* Error */}
        {fetchErr ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {fetchErr}
          </div>
        ) : null}

        {/* Filters */}
        <CardShell
          title="Filters"
          right={
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Live data
            </div>
          }
          subtle
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  placeholder="Search by name, city, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All Cities" : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All Categories" : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="md:col-span-12 flex items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={featuredOnly}
                  onChange={(e) => setFeaturedOnly(e.target.checked)}
                />
                Show featured only
              </label>

              <button
                className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50"
                type="button"
                onClick={() => {
                  setSearch("");
                  setCity("all");
                  setCategory("all");
                  setStatus("all");
                  setFeaturedOnly(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </CardShell>

        {/* Stores Table */}
        <CardShell title={`All Stores (${filtered.length})`} right={loading ? <Pill>Loading…</Pill> : null}>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
                <Store className="h-6 w-6 text-gray-800" />
              </div>
              <div className="mt-3 text-lg font-semibold text-gray-900">No stores found</div>
              <div className="mt-1 text-sm text-gray-600">
                Try changing filters, or add your first store.
              </div>
              <button
                className="mt-4 h-10 rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-orange-200"
                style={{
                  background:
                    "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                }}
                type="button"
                onClick={onAddStore}
              >
                Add Store
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Store</th>
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Featured</th>
                    <th className="py-2 pr-4 font-medium">Updated</th>
                    <th className="py-2 pr-0 font-medium text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                            <Store className="h-5 w-5 text-gray-800" />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{s.name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {s.city || "—"}
                              {s.region ? <span className="text-gray-300">•</span> : null}
                              {s.region ? <span>{s.region}</span> : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4 text-gray-700">{s.category || "—"}</td>

                      <td className="py-3 pr-4">
                        {s.is_active !== false ? (
                          <Pill tone="green">Active</Pill>
                        ) : (
                          <Pill tone="red">Inactive</Pill>
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        {s.is_featured ? <Pill tone="yellow">Featured</Pill> : <Pill>—</Pill>}
                      </td>

                      <td className="py-3 pr-4 text-gray-500">
                        {timeAgo(s.updated_at || s.created_at)}
                      </td>

                      <td className="py-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="h-9 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                            type="button"
                            onClick={() => onView(s.id)}
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>

                          <button
                            className="h-9 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                            type="button"
                            onClick={() => onEdit(s.id)}
                          >
                            <Pencil className="h-4 w-4" />
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>

        {/* Alerts */}
        <CardShell title="Alerts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">
                  {(stores || []).filter((s) => s.is_active === false).length} store(s) inactive
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Reactivate to start receiving orders.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">All good</div>
                <div className="text-sm text-gray-600 mt-1">
                  Stores are loading from your live database.
                </div>
              </div>
            </div>
          </div>
        </CardShell>
      </div>
    </div>
  );
}
