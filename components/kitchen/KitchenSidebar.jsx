"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, QrCode, Soup } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/restaurant/kitchen/dashboard", icon: LayoutDashboard },
  { label: "Table Orders", href: "/restaurant/kitchen/table-orders", icon: QrCode },
  { label: "Pickup Orders", href: "/restaurant/kitchen/pickup-orders", icon: Soup },
];

export default function KitchenSidebar({ collapsed = false }) {
  const pathname = usePathname();

  return (
    <aside
      className={`border-r border-gray-200 bg-white transition-all duration-300 flex flex-col ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-purple-100 text-purple-900"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
