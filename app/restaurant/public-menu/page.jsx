"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Leaf, CircleDot, BadgeCheck } from "lucide-react";

function safeMenu(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sections: [], full_menu_image_url: null };
  }
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    ...raw,
    full_menu_image_url:
      typeof raw.full_menu_image_url === "string" ? raw.full_menu_image_url : null,
    sections,
  };
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
          <div className="h-7 w-56 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-40 rounded bg-gray-100" />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
          <div className="h-5 w-44 rounded bg-gray-200" />
          <div className="mt-4 h-56 w-full rounded-xl bg-gray-100 border border-gray-200" />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white overflow-hidden animate-pulse">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
          </div>

          <div className="p-4 sm:p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4 flex gap-3">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 w-44 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-64 rounded bg-gray-100" />
                  <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicRestaurantMenuPage() {
  const searchParams = useSearchParams();
  const restaurantId = String(searchParams.get("id") || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState({ sections: [], full_menu_image_url: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        if (!restaurantId) {
          setError("Invalid restaurant id.");
          setLoading(false);
          return;
        }

        const { data, error: qErr } = await supabaseBrowser
          .from("restaurants")
          .select("id,name,city,area,menu,is_active")
          .eq("id", restaurantId)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!data) {
          setError("Restaurant not found.");
          setLoading(false);
          return;
        }

        if (!cancelled) {
          setRestaurant(data);
          setMenu(safeMenu(data.menu));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load menu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const visibleSections = useMemo(() => {
    return (menu.sections || []).map((s) => ({
      ...s,
      items: (s.items || []).filter((i) => i?.is_available !== false),
    }));
  }, [menu]);

  if (loading) return <MenuSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{restaurant?.name || "Menu"}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {[restaurant?.area, restaurant?.city].filter(Boolean).join(", ")}
          </p>
        </div>

        {menu?.full_menu_image_url ? (
          <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Full Menu Card</div>
            <div className="text-sm text-gray-500 mt-1">Complete menu image provided by restaurant.</div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-2">
              <img
                src={menu.full_menu_image_url}
                alt="Full menu card"
                className="w-full max-h-[620px] object-contain rounded-lg bg-white"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-5">
          {visibleSections.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
              Menu is not available yet.
            </div>
          ) : (
            visibleSections.map((section) => (
              <div key={section.id} className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="text-lg font-semibold text-gray-900">{section.name}</div>
                  {section.description ? (
                    <div className="text-sm text-gray-500 mt-1">{section.description}</div>
                  ) : null}
                </div>

                <div className="p-4 sm:p-5 space-y-3">
                  {(section.items || []).length === 0 ? (
                    <div className="text-sm text-gray-500">No available items.</div>
                  ) : (
                    section.items.map((item) => {
                      const img = Array.isArray(item.image_urls) ? item.image_urls[0] : null;
                      return (
                        <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4 flex gap-3">
                          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                            {img ? (
                              <img src={img} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-gray-400">No Image</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm sm:text-base font-semibold text-gray-900 truncate">{item.name}</div>
                              {item.is_bestseller ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  <BadgeCheck className="h-3.5 w-3.5" /> Bestseller
                                </span>
                              ) : null}
                              {item.is_veg ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                  <Leaf className="h-3.5 w-3.5" /> Veg
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  <CircleDot className="h-3.5 w-3.5 fill-red-600 text-red-600" /> Non-veg
                                </span>
                              )}
                            </div>
                            {item.description ? <div className="mt-1 text-xs sm:text-sm text-gray-600">{item.description}</div> : null}
                            <div className="mt-2 text-sm sm:text-base font-bold text-gray-900">{money(item.price)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
