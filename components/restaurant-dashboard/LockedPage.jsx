"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Tag } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const PLAN_LABELS = {
  discoverable: "Discoverable only",
  deals: "Discoverable + Deals",
  booking: "Discoverable + Book a table",
};

// Shows a page as a read-only preview: visible, but nothing inside can be clicked, typed or focused.
export default function LockedPage({ plan, restaurantId, showDeals, children }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#FFD3C2] bg-[#FFF7F4] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#FF4800]">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-gray-900">This feature isn&apos;t included in your service</div>
            <div className="text-xs text-gray-600">
              Your restaurant is set up for {PLAN_LABELS[plan] || "a limited service"}. This page is shown as a
              preview only. Contact Pass Privé if you have questions.
            </div>
          </div>
        </div>
      </div>

      {showDeals ? <DealsSummary restaurantId={restaurantId} /> : null}

      <div inert className="pointer-events-none select-none opacity-60" aria-disabled="true">
        {children}
      </div>
    </div>
  );
}

function DealsSummary({ restaurantId }) {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    const now = new Date().toISOString();
    Promise.all([
      supabaseBrowser
        .from("restaurant_offers")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .or(`end_at.is.null,end_at.gt.${now}`),
      supabaseBrowser
        .from("restaurant_deals")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .or(`ends_at.is.null,ends_at.gt.${now}`),
    ]).then(([offers, deals]) => {
      if (!active) return;
      setCounts({ offers: offers.count || 0, deals: deals.count || 0 });
    });
    return () => {
      active = false;
    };
  }, [restaurantId]);

  const live = counts ? counts.offers + counts.deals : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF4800]">
          <Tag className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm text-gray-500">Live deals & offers</div>
          <div className="text-2xl font-bold text-gray-900">{live === null ? "—" : live}</div>
        </div>
      </div>
      <Link
        href="/restaurant/offers"
        className="rounded-xl bg-[#FF4800] px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90"
      >
        Manage deals
      </Link>
    </div>
  );
}
