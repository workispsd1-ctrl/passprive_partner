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
  Settings,
  Soup,
  Megaphone,
  QrCode,
  X,
  Crown,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const nav = [
  { label: "Dashboard", href: "/restaurant/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/restaurant/bookings", icon: CalendarCheck },
  { label: "Table Orders", href: "/restaurant/table-orders", icon: QrCode, key: "table_orders", premium: true },
  { label: "Pickup Orders", href: "/restaurant/orders", icon: Soup, key: "pickup_orders"},
  { label: "Menu", href: "/restaurant/menu", icon: UtensilsCrossed },
  { label: "Offers", href: "/restaurant/offers", icon: Tag, },
  { label: "Reviews", href: "/restaurant/reviews", icon: Star },
  { label: "Analytics", href: "/restaurant/analytics", icon: LineChart },
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
        checked ? "bg-emerald-500 border-emerald-500" : "bg-gray-200 border-gray-300"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
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
            className="h-9 rounded-xl bg-[#DA3224] text-white px-4 text-sm font-medium hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Saving..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantSidebar() {
  const pathname = usePathname();

  const [restaurantId, setRestaurantId] = useState(null);
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
    return `restaurant_table_orders_last_seen_${restaurantId}`;
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

      const { data, error } = await supabaseBrowser
        .from("restaurants")
        .select("id, is_active, subscribed")
        .eq("owner_user_id", user.id)
        .single();

      if (!mounted) return;

      if (!error && data) {
        setRestaurantId(data.id);
        setIsActive(Boolean(data.is_active));
        setTablesSubscribed(data?.subscribed === true);
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
        .from("restaurant_table_orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("status", "PLACED")
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
          table: "restaurant_table_orders",
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
        className="
          hidden lg:flex lg:flex-col lg:w-70
          sticky top-0 h-screen
          border-r border-gray-200 bg-white
        "
      >
        <div className="h-16 flex items-center px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl" style={{ backgroundColor: "var(--accent)" }} />
            <div>
              <div className="font-bold leading-tight">Restaurant Partner</div>
              <div className="text-xs text-gray-500">Dashboard</div>
            </div>
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
                className={[
                  "relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                ].join(" ")}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" style={{ color: active ? "var(--accent)" : undefined }} />
                  {item.label}
                  {item.premium ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">
                      <Crown className="h-2.5 w-2.5" />
                      Premium
                    </span>
                  ) : null}
                </span>

                {badgeCount > 0 ? (
                  <span className="inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-[#DA3224] px-1.5 text-[11px] font-semibold text-white">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 shrink-0 border-t border-gray-200 space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
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
              <StatusSwitch
                checked={isActive}
                onChange={onToggleActive}
                disabled={statusLoading || statusSaving || !restaurantId}
              />
            </div>
            {statusSaving ? <div className="text-xs text-amber-600 mt-2">Saving status...</div> : null}
          </div>

          <Link href="/restaurant/offers" className="block">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold">Quick Actions</div>
              <div className="text-xs text-gray-600 mt-1">
                Create offers, update hours, manage menu.
              </div>
              <button
                className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium hover:bg-gray-50 cursor-pointer"
                type="button"
              >
                Create Offer
              </button>
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
