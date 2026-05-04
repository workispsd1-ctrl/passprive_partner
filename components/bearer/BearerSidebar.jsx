"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  QrCode,
  ListIndentDecrease,
  TextAlignJustify,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",    href: "/restaurant/bearer/dashboard",    icon: LayoutGrid },
  { label: "Table Orders", href: "/restaurant/bearer/table-orders", icon: QrCode },
];

export default function BearerSidebar({ collapsed = false, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`hidden lg:flex lg:flex-col sticky top-0 h-screen shrink-0 border-r border-slate-200 bg-white transition-all ${
        collapsed ? "w-[5.5rem]" : "w-64"
      }`}
    >
      {/* Header / Toggle */}
      <div
        className={`h-16 border-b border-slate-200 flex items-center ${
          collapsed ? "justify-center px-2" : "justify-between px-5"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="h-12 w-12 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <TextAlignJustify className="h-7 w-7" />
          ) : (
            <ListIndentDecrease className="h-7 w-7" />
          )}
        </button>
      </div>

      {/* Nav Items */}
      <nav className="px-3 py-4 space-y-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`h-16 rounded-xl px-3 text-base font-semibold flex items-center ${
                collapsed ? "justify-center" : "gap-3"
              } border transition ${
                active
                  ? "border-[#771FA8] bg-[#F4E7D1] text-[#771FA8]"
                  : "border-transparent text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-7 w-7" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
