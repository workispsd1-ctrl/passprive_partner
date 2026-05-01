"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, QrCode, Soup, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Dashboard",     href: "/restaurant/kitchen/dashboard",      icon: LayoutDashboard },
  { label: "Table Orders",  href: "/restaurant/kitchen/table-orders",   icon: QrCode },
  { label: "Pickup Orders", href: "/restaurant/kitchen/pickup-orders",  icon: Soup },
];

export default function KitchenSidebar({ collapsed = false, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`relative flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
        )}
      </button>

      {/* Nav Items */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-purple-100 text-purple-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon
                className={`h-5 w-5 flex-shrink-0 ${
                  isActive ? "text-purple-700" : "text-gray-500 group-hover:text-gray-700"
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}

              {/* Tooltip when collapsed */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
