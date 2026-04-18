"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  UtensilsCrossed,
  Tag,
  Star,
  LineChart,
  Wallet,
  Receipt,
  Settings,
  Clock3,
  Soup,
  Megaphone,
  QrCode,
  X,
  Crown,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchOwnedRestaurantStatus } from "@/lib/restaurantData";

const THEME_BG = "#F4E7D1";
const THEME_ACCENT = "#771FA899";
const THEME_ACCENT_SOLID = "#771FA8";

const nav = [
  { label: "Dashboard", href: "/restaurant/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/restaurant/bookings", icon: CalendarCheck },
  { label: "Table Orders", href: "/restaurant/table-orders", icon: QrCode, key: "table_orders", premium: true },
  { label: "Pickup Orders", href: "/restaurant/orders", icon: Soup, key: "pickup_orders"},
  { label: "Menu", href: "/restaurant/menu", icon: UtensilsCrossed },
  { label: "Offers", href: "/restaurant/offers", icon: Tag, },
  { label: "Reviews", href: "/restaurant/reviews", icon: Star },
  { label: "Analytics", href: "/restaurant/analytics", icon: LineChart },
  { label: "Timings", href: "/restaurant/timings", icon: Clock3 },
  { label: "Transactions", href: "/restaurant/transactions", icon: Receipt },
  { label: "Payouts", href: "/restaurant/payouts", icon: Wallet },
  { label: "Ads & Boost", href: "/restaurant/add-request", icon: Megaphone },
  { label: "Settings", href: "/restaurant/settings", icon: Settings },
];

function StatusSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
        checked ? "" : "bg-gray-200 border-gray-300"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      style={checked ? { backgroundColor: THEME_ACCENT_SOLID, borderColor: THEME_ACCENT_SOLID } : undefined}
      aria-pressed={checked}
      aria-label="Toggle restaurant status"
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function ConfirmModal({
  open,
  loading,
  title,
  description,
  confirmText,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-gray-600">{description}</div>

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
            className="h-9 rounded-xl text-white px-4 text-sm font-medium hover:opacity-95 disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
          >
            {loading ? "Saving..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantSidebar({ collapsed = false }) {
  const pathname = usePathname();

  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [restaurantLogo, setRestaurantLogo] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [tablesSubscribed, setTablesSubscribed] = useState(false);

  const [statusLoading, setStatusLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);

  const [unreadTableOrders, setUnreadTableOrders] = useState(0);
  const [unreadPickupOrders, setUnreadPickupOrders] = useState(0);

  const tableOrdersSeenKey = useMemo(() => {
    if (!restaurantId) return null;
    return `restaurant_bookings_last_seen_${restaurantId}`;
  }, [restaurantId]);

  const pickupOrdersSeenKey = useMemo(() => {
    if (!restaurantId) return null;
    return `restaurant_pickup_orders_last_seen_${restaurantId}`;
  }, [restaurantId]);

  const filteredNav = useMemo(() => {
    return nav.filter((item) => {
      if (item.key === "table_orders") return tablesSubscribed === true;
      return true;
    });
  }, [tablesSubscribed]);

  useEffect(() => {
    let mounted = true;

    async function loadRestaurantStatus() {
      setStatusLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        if (mounted) setStatusLoading(false);
        return;
      }

      try {
        const data = await fetchOwnedRestaurantStatus(supabaseBrowser, user.id);
        if (!mounted) return;
        setRestaurantId(data.restaurantId);
        setRestaurantName(data.restaurantName || "Restaurant");
        setRestaurantLogo(data.restaurantLogo || "");
        setIsActive(Boolean(data.isActive));
        setTablesSubscribed(Boolean(data.hasSubscription));
      } catch {
        if (!mounted) return;
      }

      setStatusLoading(false);
    }

    loadRestaurantStatus();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!tableOrdersSeenKey) return;
    if (pathname === "/restaurant/table-orders" || pathname.startsWith("/restaurant/table-orders/")) {
      localStorage.setItem(tableOrdersSeenKey, new Date().toISOString());
      setUnreadTableOrders(0);
    }
  }, [pathname, tableOrdersSeenKey]);

  useEffect(() => {
    if (!pickupOrdersSeenKey) return;
    if (pathname === "/restaurant/orders" || pathname.startsWith("/restaurant/orders/")) {
      localStorage.setItem(pickupOrdersSeenKey, new Date().toISOString());
      setUnreadPickupOrders(0);
    }
  }, [pathname, pickupOrdersSeenKey]);

  useEffect(() => {
    if (!restaurantId || !tableOrdersSeenKey || !pickupOrdersSeenKey) return;
    let mounted = true;

    const isOnTableOrdersPage =
      pathname === "/restaurant/table-orders" || pathname.startsWith("/restaurant/table-orders/");
    const isOnPickupOrdersPage =
      pathname === "/restaurant/orders" || pathname.startsWith("/restaurant/orders/");

    async function loadUnreadTableCount() {
      const lastSeenAt = localStorage.getItem(tableOrdersSeenKey) || "1970-01-01T00:00:00.000Z";

      const { count, error } = await supabaseBrowser
        .from("restaurant_bookings")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("read", false)
        .gt("created_at", lastSeenAt);

      if (!mounted) return;
      if (!error) setUnreadTableOrders(count ?? 0);
    }

    async function loadUnreadPickupCount() {
      const lastSeenAt = localStorage.getItem(pickupOrdersSeenKey) || "1970-01-01T00:00:00.000Z";

      const { count, error } = await supabaseBrowser
        .from("restaurant_orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("order_status", "NEW")
        .gt("created_at", lastSeenAt);

      if (!mounted) return;
      if (!error) setUnreadPickupOrders(count ?? 0);
    }

    const refreshUnreadCounts = async () => {
      if (isOnTableOrdersPage) {
        localStorage.setItem(tableOrdersSeenKey, new Date().toISOString());
        setUnreadTableOrders(0);
      } else {
        await loadUnreadTableCount();
      }

      if (isOnPickupOrdersPage) {
        localStorage.setItem(pickupOrdersSeenKey, new Date().toISOString());
        setUnreadPickupOrders(0);
      } else {
        await loadUnreadPickupCount();
      }
    };

    refreshUnreadCounts();

    const channel = supabaseBrowser
      .channel(`restaurant_order_badges_${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_bookings",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        refreshUnreadCounts
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        refreshUnreadCounts
      )
      .subscribe();

    const pollId = window.setInterval(refreshUnreadCounts, 5000);

    const onFocus = () => refreshUnreadCounts();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshUnreadCounts();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabaseBrowser.removeChannel(channel);
    };
  }, [restaurantId, tableOrdersSeenKey, pickupOrdersSeenKey, pathname]);

  function onToggleActive(nextValue) {
    if (!restaurantId || statusSaving) return;
    setPendingStatus(Boolean(nextValue));
    setConfirmOpen(true);
  }

  async function confirmToggle() {
    if (!restaurantId || pendingStatus === null || statusSaving) return;

    const prev = isActive;
    const nextValue = Boolean(pendingStatus);

    setIsActive(nextValue);
    setStatusSaving(true);

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ is_active: nextValue })
      .eq("id", restaurantId);

    if (error) {
      setIsActive(prev);
    }

    setStatusSaving(false);
    setConfirmOpen(false);
    setPendingStatus(null);
  }

  function closeConfirm() {
    if (statusSaving) return;
    setConfirmOpen(false);
    setPendingStatus(null);
  }

  return (
    <>
      <aside
        className="hidden lg:flex lg:flex-col sticky top-0 h-screen border-r border-gray-200 bg-white transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? "5.5rem" : "17.5rem" }}
      >
        <div className={`h-16 flex items-center border-b border-gray-200 shrink-0 ${collapsed ? "justify-center px-3" : "px-6"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
            <div className="h-10 w-10 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {restaurantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="grid h-full w-full place-items-center text-sm font-bold text-white"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {String(restaurantName || "R").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            {!collapsed ? (
              <div>
                <div className="max-w-[150px] truncate font-bold leading-tight">{restaurantName}</div>
                <div className="text-xs text-gray-500">Restaurant</div>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            const badgeCount =
              item.key === "table_orders"
                ? unreadTableOrders
                : item.key === "pickup_orders"
                ? unreadPickupOrders
                : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  "relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  collapsed ? "justify-center" : "justify-between",
                  active
                    ? "text-gray-900 border"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                ].join(" ")}
                style={
                  active
                    ? {
                        background: THEME_BG,
                        borderColor: THEME_ACCENT,
                        boxShadow: "0 14px 34px -24px rgba(119,31,168,0.45)",
                      }
                    : undefined
                }
              >
                <span className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <Icon className="h-4 w-4" style={{ color: active ? THEME_ACCENT_SOLID : undefined }} />
                  </span>
                  {!collapsed ? (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.premium ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">
                          <Crown className="h-2.5 w-2.5" />
                          Premium
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </span>

                {badgeCount > 0 ? (
                  <span
                    className={[
                      "inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white",
                      collapsed ? "absolute right-2 top-1.5" : "",
                    ].join(" ")}
                    style={{ backgroundColor: THEME_ACCENT_SOLID }}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className={`shrink-0 border-t border-gray-200 ${collapsed ? "p-3" : "p-4"} space-y-3`}>
          <div className={`rounded-2xl border border-gray-200 bg-white ${collapsed ? "p-3" : "p-4"}`}>
            <div
              className={`flex gap-3 ${
                collapsed ? "flex-col items-center justify-center" : "items-center justify-between"
              }`}
            >
              {!collapsed ? (
                <div>
                  <div className="text-sm font-semibold">Restaurant Visibility</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {statusLoading
                      ? "Loading status..."
                      : isActive
                      ? "Visible to customers"
                      : "Hidden from customers"}
                  </div>
                </div>
              ) : (
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    statusLoading ? "bg-gray-300" : isActive ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  title={
                    statusLoading
                      ? "Loading visibility status"
                      : isActive
                      ? "Restaurant visible to customers"
                      : "Restaurant hidden from customers"
                  }
                />
              )}
              <StatusSwitch
                checked={isActive}
                onChange={onToggleActive}
                disabled={statusLoading || statusSaving || !restaurantId}
              />
            </div>
            {!collapsed && statusSaving ? <div className="text-xs text-amber-600 mt-2">Saving status...</div> : null}
          </div>

          <Link href="/restaurant/offers" className="block">
            <div
              className={`rounded-2xl border ${collapsed ? "p-3" : "p-4"}`}
              style={{ background: THEME_BG, borderColor: THEME_ACCENT }}
            >
              {!collapsed ? (
                <>
                  <div className="text-sm font-semibold">Quick Actions</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Create offers, update hours, manage menu.
                  </div>
                  <button
                    className="mt-3 w-full rounded-xl border bg-white py-2 text-sm font-medium cursor-pointer"
                    style={{ borderColor: THEME_ACCENT, color: THEME_ACCENT_SOLID }}
                    type="button"
                  >
                    Create Offer
                  </button>
                </>
              ) : (
                <div className="flex justify-center">
                  <Tag className="h-5 w-5" style={{ color: THEME_ACCENT_SOLID }} />
                </div>
              )}
            </div>
          </Link>
        </div>
      </aside>

      <ConfirmModal
        open={confirmOpen}
        loading={statusSaving}
        title={pendingStatus ? "Set Restaurant Active?" : "Set Restaurant Inactive?"}
        description={
          pendingStatus
            ? "Restaurant will be visible to customers and can receive bookings/orders."
            : "Restaurant will be hidden from customers and will not appear publicly."
        }
        confirmText={pendingStatus ? "Yes, Set Active" : "Yes, Set Inactive"}
        onConfirm={confirmToggle}
        onCancel={closeConfirm}
      />
    </>
  );
}
