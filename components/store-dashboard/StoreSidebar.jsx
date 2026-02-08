"use client";

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
} from "lucide-react";

const BRAND_ACCENT = "#ff5a1f";
const ACTIVE_ICON = "#ff5a1f";
const INACTIVE_ICON = "#6b7280";

const nav = [
  { label: "Dashboard", href: "/store-partner/dashboard", icon: LayoutDashboard },

  // Multi-store (HQ / branches)
  { label: "My Stores", href: "/store-partner/all-stores", icon: Store },

  // District modules
  { label: "Offers", href: "/store-partner/offers", icon: Tag },
  { label: "Catalogue", href: "/store-partner/catalogue", icon: Boxes },

  // New requested items
  { label: "Reviews", href: "/store-partner/reviews", icon: MessageSquareText },
  { label: "Payouts", href: "/store-partner/payouts", icon: Wallet },

  // Settings includes store details, location, images, etc.
  { label: "Settings", href: "/store-partner/settings", icon: Settings },
];

export default function StoreSidebar() {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === "/store-partner/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[280px] lg:min-h-screen border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div
            className="h-9 w-9 rounded-xl"
            style={{ backgroundColor: BRAND_ACCENT }}
          />
          <div>
            <div className="font-bold leading-tight">Store Partner</div>
            <div className="text-xs text-gray-500">Dashboard</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active = isActive(item.href);
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

      {/* Footer card */}
      <div className="p-4">
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
