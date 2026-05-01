"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Package2, CalendarCheck2, QrCode, ShoppingBag, Table2, ChevronLeft, ChevronRight, ListIndentDecrease, TextAlignJustify } from "lucide-react";

const items = [
  { href: "/cashier/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/cashier/orders", label: "Orders", icon: Package2 },
  { href: "/cashier/bookings", label: "Table Bookings", icon: CalendarCheck2 },
  { href: "/cashier/table-orders", label: "QR Orders", icon: QrCode },
  { href: "/cashier/pickup-orders", label: "Pickup Orders", icon: ShoppingBag },
  { href: "/cashier/table-layout", label: "Table Layout", icon: Table2 },
];

export default function CashierSidebar({ collapsed = false, onToggle }) {
  const pathname = usePathname();

  return (
    <aside className={`hidden lg:flex lg:flex-col sticky top-0 h-screen shrink-0 border-r border-slate-200 bg-white transition-all ${collapsed ? "w-[5.5rem]" : "w-64"}`}>
      <div className={`h-16 border-b border-slate-200 flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
        
        <button
          type="button"
          onClick={onToggle}
          className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <TextAlignJustify className="h-4 w-4" /> : <ListIndentDecrease className="h-4 w-4" />}
        </button>
      </div>

      <nav className="px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`h-11 rounded-xl px-3 text-sm font-semibold flex items-center ${collapsed ? "justify-center" : "gap-2"} border transition ${
                active
                  ? "border-[#771FA8] bg-[#F4E7D1] text-[#771FA8]"
                  : "border-transparent text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
