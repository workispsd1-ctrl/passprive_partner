"use client";

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
} from "lucide-react";

const nav = [
  { label: "Dashboard", href: "/restaurant/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/restaurant/bookings", icon: CalendarCheck },
  { label: "Menu", href: "/restaurant/menu", icon: UtensilsCrossed },
  { label: "Offers", href: "/restaurant/offers", icon: Tag },
  { label: "Reviews", href: "/restaurant/reviews", icon: Star },
  { label: "Analytics", href: "/restaurant/analytics", icon: LineChart },
  { label: "Payouts", href: "/restaurant/payouts", icon: Wallet },
  { label: "Settings", href: "/restaurant/settings", icon: Settings },
];

export default function RestaurantSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
        hidden lg:flex lg:flex-col lg:w-70
        sticky top-0 h-screen
        border-r border-gray-200 bg-white
      "
    >
      {/* Brand (fixed) */}
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

      {/* Nav (scrolls if needed) */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href;
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

      {/* Footer card (fixed at bottom) */}
      <div className="p-4 shrink-0 border-t border-gray-200">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold">Quick Actions</div>
          <div className="text-xs text-gray-600 mt-1">
            Create offers, update hours, manage menu.
          </div>

          <button
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium hover:bg-gray-50"
            type="button"
          >
            Create Offer
          </button>
        </div>
      </div>
    </aside>
  );
}
