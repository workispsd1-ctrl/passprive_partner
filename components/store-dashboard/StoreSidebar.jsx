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
  Megaphone,
  X,
  AlertTriangle,
  Check,
  Crown,
  CreditCard,
  Package,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const BRAND_ACCENT = "#ff5a1f";
const ACTIVE_ICON = "#ff5a1f";
const INACTIVE_ICON = "#6b7280";

const CACHE_KEY = "store_sidebar_cache_v1";
const ACTIVE_STORE_KEY = "store_partner_selected_store_id";

const baseNav = [
  { label: "Dashboard", href: "/store-partner/dashboard", icon: LayoutDashboard },
  { label: "Pickup Orders", href: "/store-partner/pickup-orders", icon: ShoppingCart, key: "pickup-orders", premium: true },
  { label: "Payment Orders", href: "/store-partner/payment-orders", icon: CreditCard, key: "payment-orders" },
  { label: "Catalogue", href: "/store-partner/catalogue", icon: Boxes, key: "pickup-catalogue" },
  { label: "Inventory", href: "/store-partner/inventory", icon: Package, key: "inventory", premium: true },
  { label: "My Stores", href: "/store-partner/all-stores", icon: Store },
  { label: "Offers", href: "/store-partner/offers", icon: Tag },
  { label: "Reviews", href: "/store-partner/reviews", icon: MessageSquareText },
  { label: "Payouts", href: "/store-partner/payouts", icon: Wallet },
  { label: "Ads & Boost", href: "/store-partner/add-request", icon: Megaphone },
  { label: "Settings", href: "/store-partner/settings", icon: Settings },
];

function isPremiumActive(store) {
  if (!store?.pickup_premium_enabled) return false;
  if (!store?.pickup_premium_expires_at) return true;
  const ts = new Date(store.pickup_premium_expires_at).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function normalizeMemberStore(storesField) {
  if (Array.isArray(storesField)) return storesField[0] || null;
  return storesField || null;
}

// Fixed StatusSwitch: icons stay inside the thumb at all times
function StatusSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "56px",
        height: "30px",
        borderRadius: "999px",
        border: "1.5px solid",
        borderColor: checked ? "#10b981" : "#d1d5db",
        backgroundColor: checked ? "#10b981" : "#f3f4f6",
        transition: "background-color 0.2s, border-color 0.2s",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        padding: "2px",
        flexShrink: 0,
      }}
      aria-pressed={checked}
      aria-label="Toggle store active"
    >
      {/* Thumb */}
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "calc(100% - 28px)" : "2px",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Check style={{ width: "13px", height: "13px", color: "#10b981", strokeWidth: 2.5 }} />
        ) : (
          <X style={{ width: "13px", height: "13px", color: "#9ca3af", strokeWidth: 2.5 }} />
        )}
      </span>
    </button>
  );
}

function ConfirmModal({ open, loading, nextValue, storeName, onCancel, onConfirm }) {
  if (!open) return null;
  const isActivate = nextValue === true;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">Confirm Store Visibility</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900 mb-1">{storeName || "Selected Store"}</div>
          {isActivate
            ? "This store will be visible to customers and can receive orders."
            : "This store will be hidden from customers and won't be discoverable publicly."}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "h-9 rounded-xl px-4 text-sm font-medium text-white disabled:opacity-60",
              isActivate ? "bg-emerald-600 hover:bg-emerald-500" : "bg-[#DA3224] hover:opacity-95",
            ].join(" ")}
          >
            {loading ? "Saving..." : isActivate ? "Yes, Activate" : "Yes, Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function queryCountFallback(queries) {
  for (const q of queries) {
    const { count, error } = await q();
    if (!error) return count || 0;
  }
  return 0;
}

export default function StoreSidebar() {
  const pathname = usePathname();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);

  const [pickupOrderCount, setPickupOrderCount] = useState(0);
  const [paymentOnlyCount, setPaymentOnlyCount] = useState(0);

  const selectedStore = useMemo(
    () => stores.find((s) => String(s.id) === String(selectedStoreId)) || null,
    [stores, selectedStoreId]
  );

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);
  const selectedStoreHasPremium = useMemo(() => isPremiumActive(selectedStore), [selectedStore]);

  const nav = useMemo(() => {
    return baseNav.filter((n) => !n.premium || selectedStoreHasPremium);
  }, [selectedStoreHasPremium]);

  const isActiveRoute = (href) => {
    if (href === "/store-partner/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const writeCache = (next = {}) => {
    try {
      const current = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}");
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...next }));
    } catch {}
  };

  const persistSelectedStore = (id) => {
    if (!id) return;
    try {
      writeCache({ selectedStoreId: id });
      localStorage.setItem(ACTIVE_STORE_KEY, String(id));
      window.dispatchEvent(new Event("store-selection-changed"));
    } catch {}
  };

  const hydrateCache = () => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}");
      if (Array.isArray(raw.stores) && raw.stores.length) setStores(raw.stores);
      if (raw.selectedStoreId) setSelectedStoreId(String(raw.selectedStoreId));
      if (typeof raw.pickupOrderCount === "number") setPickupOrderCount(raw.pickupOrderCount);
      if (typeof raw.paymentOnlyCount === "number") setPaymentOnlyCount(raw.paymentOnlyCount);
    } catch {}
  };

  const markPickupOrdersSeen = async (ids) => {
    if (!ids?.length) return;

    const nowIso = new Date().toISOString();
    const attempts = [
      () =>
        supabaseBrowser
          .from("store_orders")
          .update({ partner_seen_at: nowIso })
          .in("store_id", ids)
          .in("status", ["NEW", "PLACED"])
          .eq("order_flow", "PREMIUM")
          .is("partner_seen_at", null),
      () =>
        supabaseBrowser
          .from("store_orders")
          .update({ partner_seen_at: nowIso })
          .in("store_id", ids)
          .in("status", ["NEW", "PLACED"])
          .filter("metadata->>order_flow", "eq", "PREMIUM")
          .is("partner_seen_at", null),
      () =>
        supabaseBrowser
          .from("store_orders")
          .update({ partner_seen_at: nowIso })
          .in("store_id", ids)
          .in("status", ["NEW", "PLACED"])
          .is("partner_seen_at", null),
    ];

    for (const run of attempts) {
      const { error } = await run();
      if (!error) break;
    }
  };

  const fetchOrderBadges = async (ids) => {
    if (!ids?.length) {
      setPickupOrderCount(0);
      setPaymentOnlyCount(0);
      writeCache({ pickupOrderCount: 0, paymentOnlyCount: 0 });
      return;
    }

    const commonBase = () =>
      supabaseBrowser
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .in("store_id", ids)
        .in("status", ["NEW", "PLACED"]);

    const premium = await queryCountFallback([
      () => commonBase().eq("order_flow", "PREMIUM").is("partner_seen_at", null),
      () => commonBase().filter("metadata->>order_flow", "eq", "PREMIUM").is("partner_seen_at", null),
      () => commonBase().eq("order_flow", "PREMIUM"),
      () => commonBase().filter("metadata->>order_flow", "eq", "PREMIUM"),
    ]);

    const basic = await queryCountFallback([
      () => commonBase().eq("order_flow", "BASIC").is("partner_seen_at", null),
      () => commonBase().filter("metadata->>order_flow", "eq", "BASIC").is("partner_seen_at", null),
      () => commonBase().eq("order_flow", "BASIC"),
      () => commonBase().filter("metadata->>order_flow", "eq", "BASIC"),
      () => commonBase(),
    ]);

    setPickupOrderCount(premium);
    setPaymentOnlyCount(basic);
    writeCache({ pickupOrderCount: premium, paymentOnlyCount: basic });
  };

  useEffect(() => {
    hydrateCache();

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
          .select("id,name,city,is_active,pickup_premium_enabled,pickup_premium_expires_at")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });
        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id(id,name,city,is_active,pickup_premium_enabled,pickup_premium_expires_at)")
          .eq("user_id", userId);
        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || [])
          .map((r) => normalizeMemberStore(r.stores))
          .filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));

        const allStores = Array.from(merged.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (cancelled) return;

        setStores(allStores);
        writeCache({ stores: allStores });

        if (allStores.length) {
          const cachedSession = (() => {
            try {
              return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}")?.selectedStoreId;
            } catch {
              return null;
            }
          })();

          const cachedLocal = (() => {
            try {
              return localStorage.getItem(ACTIVE_STORE_KEY);
            } catch {
              return null;
            }
          })();

          const preferred = cachedLocal || cachedSession;
          const chosen = allStores.some((s) => String(s.id) === String(preferred))
            ? String(preferred)
            : String(allStores[0].id);

          setSelectedStoreId(chosen);
          persistSelectedStore(chosen);
        }
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

  useEffect(() => {
    persistSelectedStore(selectedStoreId);
  }, [selectedStoreId]);

  useEffect(() => {
    if (!storeIds.length) {
      setPickupOrderCount(0);
      setPaymentOnlyCount(0);
      return;
    }

    fetchOrderBadges(storeIds);

    const filter = `store_id=in.(${storeIds.join(",")})`;
    const channel = supabaseBrowser
      .channel(`store-orders-realtime-${storeIds.join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_orders", filter }, () => {
        fetchOrderBadges(storeIds);
      })
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [storeIds.join(",")]);

  useEffect(() => {
    if (!storeIds.length) return;
    const isOnPickupPage = pathname.startsWith("/store-partner/pickup-orders");
    if (!isOnPickupPage) return;

    (async () => {
      await markPickupOrdersSeen(storeIds);
      setPickupOrderCount(0);
      writeCache({ pickupOrderCount: 0 });
      fetchOrderBadges(storeIds);
    })();
  }, [pathname, storeIds.join(",")]);

  const handleToggleStore = (nextValue) => {
    if (!selectedStoreId || statusSaving) return;
    setPendingStatus(!!nextValue);
    setConfirmOpen(true);
  };

  const handleStoreSelectChange = (nextId) => {
    if (!nextId || String(nextId) === String(selectedStoreId)) return;
    persistSelectedStore(String(nextId));
    setSelectedStoreId(String(nextId));
    window.location.reload();
  };

  const closeConfirm = () => {
    if (statusSaving) return;
    setConfirmOpen(false);
    setPendingStatus(null);
  };

  const confirmToggleStore = async () => {
    if (!selectedStoreId || pendingStatus === null || statusSaving) return;

    const previous = selectedStore?.is_active !== false;
    const nextValue = !!pendingStatus;

    setStatusSaving(true);
    setStatusError("");

    setStores((prev) =>
      prev.map((s) => (String(s.id) === String(selectedStoreId) ? { ...s, is_active: nextValue } : s))
    );

    const { error } = await supabaseBrowser
      .from("stores")
      .update({ is_active: nextValue })
      .eq("id", selectedStoreId);

    if (error) {
      setStores((prev) =>
        prev.map((s) => (String(s.id) === String(selectedStoreId) ? { ...s, is_active: previous } : s))
      );
      setStatusError(error.message || "Failed to update store status.");
    }

    setStatusSaving(false);
    setConfirmOpen(false);
    setPendingStatus(null);
  };

  return (
    <>
      <aside className="hidden lg:flex lg:flex-col lg:w-[280px] h-screen sticky top-0 border-r border-gray-200 bg-white overflow-hidden">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl" style={{ backgroundColor: BRAND_ACCENT }} />
            <div>
              <div className="font-bold leading-tight">Store Partner</div>
              <div className="text-xs text-gray-500">Dashboard</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = isActiveRoute(item.href);
            const Icon = item.icon;
            const isPickup = item.key === "pickup-orders";
            const isPaymentOnly = item.key === "payment-orders";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-orange-50 text-gray-900 border border-orange-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                ].join(" ")}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" style={{ color: active ? ACTIVE_ICON : INACTIVE_ICON }} />
                  {item.label}
                  {item.premium ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                      <Crown className="h-2.5 w-2.5" />
                      Premium
                    </span>
                  ) : null}
                </span>

                {isPickup && pickupOrderCount > 0 ? (
                  <span className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-[#DA3224] px-1.5 text-[11px] font-semibold text-white">
                    {pickupOrderCount > 99 ? "99+" : pickupOrderCount}
                  </span>
                ) : null}

                {isPaymentOnly && paymentOnlyCount > 0 ? (
                  <span className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
                    {paymentOnlyCount > 99 ? "99+" : paymentOnlyCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 shrink-0 border-t border-gray-200">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold">Store Visibility</div>

            <div className="mt-3">
              <select
                value={selectedStoreId}
                onChange={(e) => handleStoreSelectChange(e.target.value)}
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

            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <Crown className="h-3.5 w-3.5" />
              {selectedStoreHasPremium ? "Pickup Premium Active" : "Pickup Premium Locked"}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span
                    className={[
                      "inline-block h-2.5 w-2.5 rounded-full",
                      selectedStore?.is_active !== false ? "bg-emerald-500" : "bg-gray-400",
                    ].join(" ")}
                  />
                  {selectedStore?.is_active !== false ? "Active" : "Inactive"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {selectedStore?.is_active !== false ? "Customers can view this store." : "Hidden from customers."}
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

            {statusError ? <div className="mt-2 text-xs text-red-600">{statusError}</div> : null}
          </div>
        </div>
      </aside>

      <ConfirmModal
        open={confirmOpen}
        loading={statusSaving}
        nextValue={pendingStatus}
        storeName={selectedStore?.name}
        onCancel={closeConfirm}
        onConfirm={confirmToggleStore}
      />
    </>
  );
}