"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  Store,
  MapPin,
  Star,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Package,
  Tag,
  Settings,
  Phone,
  Mail,
  Globe,
  Pencil,
  Plus,
  Eye,
  TrendingUp,
} from "lucide-react";

/* ---------------------------------------------
  UI Helpers
--------------------------------------------- */

function CardShell({ title, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
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
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "yellow"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function StatMini({ title, value, icon: Icon }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
        </div>
        <div className="h-11 w-11 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-800" />
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 px-3 rounded-full border text-sm font-semibold inline-flex items-center gap-2 transition",
        active
          ? "bg-gray-900 border-gray-900 text-white"
          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
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

function safeHref(v) {
  const s = String(v || "").trim();
  if (!s || s === "-") return null;
  return s;
}

function normalizeWebsite(url) {
  const s = String(url || "").trim();
  if (!s || s === "-") return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

/* ---------------------------------------------
  Simple Flat Chart (no libs)
--------------------------------------------- */
function MiniBarChart({ data, labels }) {
  const max = Math.max(1, ...data);
  return (
    <div className="w-full">
      <div className="h-[260px] rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-end gap-2 h-full">
          {data.map((v, i) => {
            const h = Math.max(6, Math.round((v / max) * 100));
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2">
                <div
                  className="w-full rounded-xl border border-gray-200 bg-gray-50"
                  style={{ height: `${h}%` }}
                  title={`${labels?.[i] || ""}: ${v}`}
                />
                <div className="text-[10px] text-gray-500">{labels?.[i] || ""}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <div>Last 7 days</div>
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            Revenue
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------
  ✅ Loading Skeletons (Pulse)
--------------------------------------------- */
function Skeleton({ className = "" }) {
  return (
    <div className={["animate-pulse rounded-xl bg-gray-200/70", className].join(" ")} />
  );
}

function StoreDetailsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Skeleton className="h-6 w-16 rounded-lg" />
                <Skeleton className="h-6 w-20 rounded-lg" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>

      {/* KPI skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-28" />
              </div>
              <Skeleton className="h-11 w-11 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Main grid skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="p-6 space-y-4">
              <Skeleton className="h-[260px] rounded-2xl" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="p-6 space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------
  Page
--------------------------------------------- */

export default function StoreDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();

  const storeId = params?.id ? String(params.id) : "";
  const initialTab = sp.get("tab") || "overview";

  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [store, setStore] = useState(null);

  const kpis = useMemo(
    () => ({
      orders7d: 128,
      revenue7d: "MUR 84,920",
      products: 312,
      offers: 6,
    }),
    []
  );

  const sales7d = useMemo(() => [9200, 12400, 9800, 15600, 13100, 14820, 12000], []);
  const salesLabels = useMemo(() => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], []);

  const recentOrders = useMemo(
    () => [
      { id: "ORD-10291", customer: "Aarav", total: "MUR 890", status: "Delivered", time: "2h ago" },
      { id: "ORD-10288", customer: "Riya", total: "MUR 1,120", status: "Preparing", time: "4h ago" },
      { id: "ORD-10273", customer: "Kiran", total: "MUR 640", status: "Cancelled", time: "Yesterday" },
      { id: "ORD-10252", customer: "Sofia", total: "MUR 1,990", status: "Delivered", time: "2 days ago" },
    ],
    []
  );

  const products = useMemo(
    () => [
      { name: "Premium Chocolate Box", sku: "CHOC-001", price: "MUR 200", stock: 34, status: "Active" },
      { name: "Gift Hamper Deluxe", sku: "HAMP-010", price: "MUR 400", stock: 12, status: "Active" },
      { name: "Organic Honey 500g", sku: "HNY-500", price: "MUR 180", stock: 0, status: "Out of Stock" },
    ],
    []
  );

  const offers = useMemo(
    () => [
      { title: "10% Off Weekend", type: "Percent", value: "10%", status: "Active", ends: "Sunday" },
      { title: "MUR 50 Off Above 500", type: "Flat", value: "MUR 50", status: "Active", ends: "7 days" },
      { title: "Buy 2 Get 1", type: "Bundle", value: "B2G1", status: "Paused", ends: "-" },
    ],
    []
  );

  const goStores = () => router.push("/store-partner/all-stores");
  const goAddStore = () => router.push("/store-partner/all-stores/add");
  const goEditStore = () => router.push(`/store-partner/all-stores/${storeId}/edit`);
  const goCreateOffer = () => router.push(`/store-partner/offers/create?store_id=${storeId}`);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sess?.session?.user?.id;
        if (!userId) {
          router.replace("/sign-in");
          return;
        }

        if (!storeId) {
          setErr("Missing store id");
          setLoading(false);
          return;
        }

        const { data, error } = await supabaseBrowser
          .from("stores")
          .select(
            "id,name,slug,description,category,subcategory,tags,phone,whatsapp,email,website,city,region,country,postal_code,address_line1,address_line2,is_active,is_featured,logo_url,cover_image_url,cover_media_type,cover_media_url,updated_at,created_at,owner_user_id"
          )
          .eq("id", storeId)
          .eq("owner_user_id", userId)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setErr("Store not found or you don't have access to it.");
          setStore(null);
          setLoading(false);
          return;
        }

        if (!cancelled) setStore(data);
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load store");
          setStore(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, storeId]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const statusPill = (status) => {
    const s = String(status || "").toLowerCase();
    const cls =
      s === "delivered"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : s === "preparing" || s === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : s === "cancelled"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-gray-50 text-gray-700 border-gray-200";

    return (
      <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${cls}`}>
        {status}
      </span>
    );
  };

  const storeStatusPill =
    store?.is_active !== false ? <Pill tone="green">Active</Pill> : <Pill tone="red">Inactive</Pill>;

  const featuredPill = store?.is_featured ? <Pill tone="yellow">Featured</Pill> : <Pill>Not featured</Pill>;

  const callHref = safeHref(store?.phone) ? `tel:${store.phone}` : null;
  const mailHref = safeHref(store?.email) ? `mailto:${store.email}` : null;
  const websiteHref = normalizeWebsite(store?.website);

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {/* Top header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 pb-8">
            <button
              type="button"
              onClick={goStores}
              className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Stores
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goEditStore}
                className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                disabled={!storeId}
                title="Edit this store"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>

              <button
                type="button"
                className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                onClick={goAddStore}
                title="Add a new store"
              >
                <Plus className="h-4 w-4" />
                Add Store
              </button>

              <button
                type="button"
                className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                style={{
                  background:
                    "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                }}
                onClick={goCreateOffer}
                disabled={!storeId}
              >
                <Tag className="h-4 w-4" />
                Create Offer
              </button>
            </div>
          </div>

          {/* ✅ Loading: Pulse skeleton instead of spinner row */}
          {loading ? (
            <StoreDetailsSkeleton />
          ) : err ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          {!loading && !err && store ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                    {store.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={store.logo_url} alt={store.name} className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-6 w-6 text-gray-800" />
                    )}
                  </div>

                  <div>
                    <div className="text-2xl font-semibold text-gray-900">{store.name}</div>
                    <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {store.city || "—"}, {store.country || "Mauritius"}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-700">{store.category || "—"}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-500">
                        Updated {timeAgo(store.updated_at || store.created_at)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {storeStatusPill}
                      {featuredPill}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    className={[
                      "h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2",
                      callHref ? "" : "opacity-50 pointer-events-none",
                    ].join(" ")}
                    href={callHref || "#"}
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </a>

                  <a
                    className={[
                      "h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2",
                      mailHref ? "" : "opacity-50 pointer-events-none",
                    ].join(" ")}
                    href={mailHref || "#"}
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </a>

                  <a
                    className={[
                      "h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2",
                      websiteHref ? "" : "opacity-50 pointer-events-none",
                    ].join(" ")}
                    href={websiteHref || "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tabs (only show when not loading and store exists, same as your flow) */}
        {!loading && !err && store ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <TabButton active={tab === "overview"} label="Overview" icon={LayoutIcon} onClick={() => setTab("overview")} />
              <TabButton active={tab === "orders"} label="Orders" icon={ShoppingBag} onClick={() => setTab("orders")} />
              <TabButton active={tab === "products"} label="Products" icon={Package} onClick={() => setTab("products")} />
              <TabButton active={tab === "offers"} label="Offers" icon={Tag} onClick={() => setTab("offers")} />
              <TabButton active={tab === "settings"} label="Settings" icon={Settings} onClick={() => setTab("settings")} />
            </div>

            {/* Tab content */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatMini title="Orders (7d)" value={String(kpis.orders7d)} icon={ShoppingBag} />
                  <StatMini title="Revenue (7d)" value={String(kpis.revenue7d)} icon={CheckCircle2} />
                  <StatMini title="Products" value={String(kpis.products)} icon={Package} />
                  <StatMini title="Active Offers" value={String(kpis.offers)} icon={Tag} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2">
                    <CardShell
                      title="Sales Overview"
                      right={
                        <div className="text-xs text-gray-500 inline-flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Last 7 days
                        </div>
                      }
                    >
                      <MiniBarChart data={sales7d} labels={salesLabels} />

                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Today</div>
                          <div className="font-semibold">MUR 12,300</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">This Week</div>
                          <div className="font-semibold">MUR 84,920</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Avg Order</div>
                          <div className="font-semibold">MUR 740</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Conversion</div>
                          <div className="font-semibold">3.2%</div>
                        </div>
                      </div>
                    </CardShell>
                  </div>

                  <CardShell title="Store Info">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="text-xs text-gray-500">Address</div>
                        <div className="text-sm font-semibold text-gray-900 mt-1">
                          {store.address_line1 || "—"}
                        </div>
                        {store.address_line2 ? (
                          <div className="text-sm text-gray-700">{store.address_line2}</div>
                        ) : null}
                        <div className="text-sm text-gray-700">
                          {store.city || "—"}
                          {store.region ? `, ${store.region}` : ""}
                          {store.postal_code ? ` ${store.postal_code}` : ""}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="text-xs text-gray-500">Contact</div>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center gap-2 text-gray-700">
                            <Phone className="h-4 w-4 text-gray-500" />
                            {store.phone || "—"}
                          </div>
                          <div className="flex items-center gap-2 text-gray-700">
                            <Mail className="h-4 w-4 text-gray-500" />
                            {store.email || "—"}
                          </div>
                          <div className="flex items-center gap-2 text-gray-700">
                            <Globe className="h-4 w-4 text-gray-500" />
                            {store.website || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="text-xs text-gray-500">Quick Actions</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                            onClick={() => setTab("orders")}
                          >
                            <Eye className="h-4 w-4" />
                            View Orders
                          </button>

                          <button
                            type="button"
                            className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2"
                            style={{
                              background:
                                "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                            }}
                            onClick={() => setTab("products")}
                          >
                            <Plus className="h-4 w-4" />
                            Add Product
                          </button>

                          <button
                            type="button"
                            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                            onClick={goAddStore}
                          >
                            <Store className="h-4 w-4" />
                            Add Store
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardShell>
                </div>
              </div>
            )}

            {tab === "orders" && (
              <CardShell
                title="Orders"
                right={
                  <button
                    type="button"
                    className="h-9 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50"
                    onClick={() => router.push(`/store-partner/orders?store_id=${storeId}`)}
                  >
                    View All
                  </button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2 pr-4 font-medium">Order</th>
                        <th className="py-2 pr-4 font-medium">Customer</th>
                        <th className="py-2 pr-4 font-medium">Total</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-0 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                        >
                          <td className="py-3 pr-4 font-semibold text-gray-900">{o.id}</td>
                          <td className="py-3 pr-4 text-gray-700">{o.customer}</td>
                          <td className="py-3 pr-4 text-gray-700">{o.total}</td>
                          <td className="py-3 pr-4">{statusPill(o.status)}</td>
                          <td className="py-3 pr-0 text-gray-500">{o.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardShell>
            )}

            {tab === "products" && (
              <CardShell
                title="Products"
                right={
                  <button
                    type="button"
                    className="h-9 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2"
                    style={{
                      background:
                        "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                    }}
                    onClick={() => router.push(`/store-partner/products?store_id=${storeId}`)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Product
                  </button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2 pr-4 font-medium">Product</th>
                        <th className="py-2 pr-4 font-medium">SKU</th>
                        <th className="py-2 pr-4 font-medium">Price</th>
                        <th className="py-2 pr-4 font-medium">Stock</th>
                        <th className="py-2 pr-0 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr
                          key={p.sku}
                          className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                        >
                          <td className="py-3 pr-4 font-semibold text-gray-900">{p.name}</td>
                          <td className="py-3 pr-4 text-gray-700">{p.sku}</td>
                          <td className="py-3 pr-4 text-gray-700">{p.price}</td>
                          <td className="py-3 pr-4 text-gray-700">{p.stock}</td>
                          <td className="py-3 pr-0 text-right">
                            {p.status === "Active" ? (
                              <Pill tone="green">Active</Pill>
                            ) : (
                              <Pill tone="red">Out of Stock</Pill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardShell>
            )}

            {tab === "offers" && (
              <CardShell
                title="Offers"
                right={
                  <button
                    type="button"
                    className="h-9 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2"
                    style={{
                      background:
                        "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                    }}
                    onClick={goCreateOffer}
                  >
                    <Plus className="h-4 w-4" />
                    Create Offer
                  </button>
                }
              >
                <div className="space-y-3">
                  {offers.map((o) => (
                    <div
                      key={o.title}
                      className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">{o.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {o.type} • {o.value} • Ends: {o.ends}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {o.status === "Active" ? <Pill tone="green">Active</Pill> : <Pill>Paused</Pill>}
                        <button
                          type="button"
                          className="h-9 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
                          onClick={() => router.push(`/store-partner/offers?store_id=${storeId}`)}
                        >
                          <Pencil className="h-4 w-4" />
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardShell>
            )}

            {tab === "settings" && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                  <CardShell
                    title="Store Settings (Demo)"
                    right={
                      <button
                        type="button"
                        className="h-9 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50"
                        onClick={goEditStore}
                      >
                        Open Full Edit Page
                      </button>
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-gray-600">Store Name</div>
                        <input
                          className="mt-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                          defaultValue={store.name || ""}
                        />
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-600">Category</div>
                        <input
                          className="mt-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                          defaultValue={store.category || ""}
                        />
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-600">City</div>
                        <input
                          className="mt-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                          defaultValue={store.city || ""}
                        />
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-600">Postal Code</div>
                        <input
                          className="mt-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                          defaultValue={store.postal_code || ""}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50"
                        onClick={() => alert("Demo: discard")}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-full px-4 text-sm font-semibold text-white"
                        style={{
                          background:
                            "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                        }}
                        onClick={() => alert("Demo: save settings")}
                      >
                        Save Changes
                      </button>
                    </div>
                  </CardShell>
                </div>

                <CardShell title="Status">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-start gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                        {store.is_active !== false ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Store Status</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Currently: {store.is_active !== false ? "Active" : "Inactive"}
                        </div>
                        <div className="mt-2">{storeStatusPill}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-start gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <Star className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Featured</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Featured stores appear higher in discovery.
                        </div>
                        <div className="mt-2">{featuredPill}</div>
                      </div>
                    </div>
                  </div>
                </CardShell>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Small icon shim so we don't import LayoutDashboard just for a tab label */
function LayoutIcon(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}
