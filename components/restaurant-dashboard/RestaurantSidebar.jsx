"use client";

import { useEffect, useState } from "react";
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
  Megaphone
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const nav = [
  { label: "Dashboard", href: "/restaurant/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/restaurant/bookings", icon: CalendarCheck },
  { label: "Orders", href: "/restaurant/orders", icon: Soup },
  { label: "Menu", href: "/restaurant/menu", icon: UtensilsCrossed },
  { label: "Offers", href: "/restaurant/offers", icon: Tag },
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

export default function RestaurantSidebar() {
  const pathname = usePathname();

  const [restaurantId, setRestaurantId] = useState(null);
  const [isActive, setIsActive] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);

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
        .select("id, is_active")
        .eq("owner_user_id", user.id)
        .single();

      if (!mounted) return;

      if (!error && data) {
        setRestaurantId(data.id);
        setIsActive(Boolean(data.is_active));
      }

      setStatusLoading(false);
    }

    loadRestaurantStatus();
    return () => {
      mounted = false;
    };
  }, []);

  async function onToggleActive(nextValue) {
    if (!restaurantId || statusSaving) return;

    const prev = isActive;
    setIsActive(nextValue);
    setStatusSaving(true);

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ is_active: Boolean(nextValue) })
      .eq("id", restaurantId);

    if (error) {
      setIsActive(prev);
    }

    setStatusSaving(false);
  }

  return (
    <aside
      className="
        hidden lg:flex lg:flex-col lg:w-70
        sticky top-0 h-screen
        border-r border-gray-200 bg-white
      "
    >
      <div className="h-16 flex items-center px-6 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="h-9 w-9 rounded-xl"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <div>
            <div className="font-bold leading-tight">Restaurant Partner</div>
            <div className="text-xs text-gray-500">Dashboard</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
            >
              <Icon
                className="h-4 w-4"
                style={{ color: active ? "var(--accent)" : undefined }}
              />
              {item.label}
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
          {statusSaving ? (
            <div className="text-xs text-amber-600 mt-2">Saving status...</div>
          ) : null}
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
  );
}
