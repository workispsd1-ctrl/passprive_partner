"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  Tag,
  Users,
  LineChart,
  Wallet,
  Settings,
} from "lucide-react";

const nav = [
  { label: "Dashboard", href: "/store-dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/store-dashboard/orders", icon: ShoppingBag },
  { label: "Products", href: "/store-dashboard/products", icon: Package },
  { label: "Inventory", href: "/store-dashboard/inventory", icon: Boxes },
  { label: "Offers", href: "/store-dashboard/offers", icon: Tag },
  { label: "Customers", href: "/store-dashboard/customers", icon: Users },
  { label: "Analytics", href: "/store-dashboard/analytics", icon: LineChart },
  { label: "Payouts", href: "/store-dashboard/payouts", icon: Wallet },
  { label: "Settings", href: "/store-dashboard/settings", icon: Settings },
];

export default function StoreSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[280px] lg:min-h-screen border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div
            className="h-9 w-9 rounded-xl"
            style={{ backgroundColor: "var(--accent)" }}
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

      {/* Footer card */}
      <div className="p-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold">Quick Actions</div>
          <div className="text-xs text-gray-600 mt-1">
            Add products, manage inventory, run offers.
          </div>

          <button
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium hover:bg-gray-50"
            type="button"
          >
            Add Product
          </button>
        </div>
      </div>
    </aside>
  );
}
