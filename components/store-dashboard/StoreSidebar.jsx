"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Tag,
  Boxes,
  MessageSquareText,
  Wallet,
  Settings,
  Store,
  ShoppingCart,
  Loader2,
  Megaphone
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const BRAND_ACCENT = "#ff5a1f";
const ACTIVE_ICON = "#ff5a1f";
const INACTIVE_ICON = "#6b7280";

const nav = [
  { label: "Dashboard", href: "/store-partner/dashboard", icon: LayoutDashboard },
  { label: "Pick and Collect", href: "/store-partner/orders", icon: ShoppingCart },
  { label: "My Stores", href: "/store-partner/all-stores", icon: Store },
  { label: "Offers", href: "/store-partner/offers", icon: Tag },
  { label: "Catalogue", href: "/store-partner/catalogue", icon: Boxes },
  { label: "Reviews", href: "/store-partner/reviews", icon: MessageSquareText },
  { label: "Payouts", href: "/store-partner/payouts", icon: Wallet },
  { label: "Ads & Boost", href: "/store-partner/add-request", icon: Megaphone },
  { label: "Settings", href: "/store-partner/settings", icon: Settings },
];

function StatusSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full border transition active:scale-[0.98]",
        checked ? "bg-emerald-500 border-emerald-500" : "bg-gray-200 border-gray-300",
        disabled ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
      aria-pressed={checked}
      aria-label="Toggle store active"
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export default function StoreSidebar() {
  const pathname = usePathname();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");

  const isActiveRoute = (href) => {
    if (href === "/store-partner/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
    };

  const selectedStore = useMemo(
    () => stores.find((s) => String(s.id) === String(selectedStoreId)) || null,
    [stores, selectedStoreId]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatusLoading(true);
        setStatusError("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sess?.session?.user?.id;
        if (!userId) {
          if (!cancelled) setStatusLoading(false);
          return;
        }

        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id, name, city, is_active")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });

        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id(id, name, city, is_active)")
          .eq("user_id", userId);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));

        const allStores = Array.from(merged.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (cancelled) return;

        setStores(allStores);
        if (allStores.length) setSelectedStoreId(String(allStores[0].id));
      } catch (e) {
        if (!cancelled) setStatusError(e?.message || "Failed to load store status.");
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleStore = async (nextValue) => {
    if (!selectedStoreId || statusSaving) return;

    const previous = selectedStore?.is_active !== false;
    const action = nextValue ? "activate" : "deactivate";
    const confirmMsg = `Are you sure you want to ${action} this store?`;
    if (!window.confirm(confirmMsg)) return;

    setStatusSaving(true);
    setStatusError("");

    setStores((prev) =>
      prev.map((s) =>
        String(s.id) === String(selectedStoreId) ? { ...s, is_active: !!nextValue } : s
      )
    );

    const { error } = await supabaseBrowser
      .from("stores")
      .update({ is_active: !!nextValue })
      .eq("id", selectedStoreId);

    if (error) {
      setStores((prev) =>
        prev.map((s) =>
          String(s.id) === String(selectedStoreId) ? { ...s, is_active: previous } : s
        )
      );
      setStatusError(error.message || "Failed to update store status.");
    }

    setStatusSaving(false);
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[280px] lg:min-h-screen border-r border-gray-200 bg-white">
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl" style={{ backgroundColor: BRAND_ACCENT }} />
          <div>
            <div className="font-bold leading-tight">Store Partner</div>
            <div className="text-xs text-gray-500">Dashboard</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = isActiveRoute(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-orange-50 text-gray-900 border border-orange-100"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
            >
              <Icon
                className="h-4 w-4"
                style={{ color: active ? ACTIVE_ICON : INACTIVE_ICON }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold">Store Visibility</div>

          <div className="mt-3">
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              disabled={statusLoading || !stores.length}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 disabled:opacity-60"
            >
              {!stores.length ? (
                <option value="">No stores found</option>
              ) : (
                stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `• ${s.city}` : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-gray-900">
                {selectedStore?.is_active !== false ? "Active" : "Inactive"}
              </div>
              <div className="text-xs text-gray-500">
                {selectedStore?.is_active !== false
                  ? "Customers can view this store."
                  : "Hidden from customers."}
              </div>
            </div>

            {statusSaving ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            ) : (
              <StatusSwitch
                checked={selectedStore?.is_active !== false}
                onChange={handleToggleStore}
                disabled={statusLoading || !selectedStore}
              />
            )}
          </div>

          {statusError ? (
            <div className="mt-2 text-xs text-red-600">{statusError}</div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold">Quick Actions</div>
          <div className="text-xs text-gray-600 mt-1">
            Add catalogue items, enable offers, manage branches.
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <Link
              href="/store-partner/catalogue"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 text-center text-sm font-medium hover:bg-gray-50"
            >
              Add Catalogue Item
            </Link>

            <Link
              href="/store-partner/offers"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 text-center text-sm font-medium hover:bg-gray-50"
            >
              Create Offer
            </Link>

            <Link
              href="/store-partner/all-stores"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 text-center text-sm font-medium hover:bg-gray-50"
            >
              Manage Stores
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
