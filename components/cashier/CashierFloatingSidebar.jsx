"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package2, QrCode, CalendarCheck2 } from "lucide-react";

const items = [
  { href: "/restaurant/orders", label: "Order", icon: Package2 },
  { href: "/cashier/table-orders", label: "QR Orders", icon: QrCode },
  { href: "/cashier/bookings", label: "Table Bookings", icon: CalendarCheck2 },
];

export default function CashierFloatingSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:block fixed left-4 top-1/2 -translate-y-1/2 z-30">
      <div className="w-56 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-2">
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`h-11 rounded-xl px-3 text-sm font-semibold flex items-center gap-2 border transition ${
                  active
                    ? "border-[#771FA8] bg-[#F4E7D1] text-[#771FA8]"
                    : "border-transparent text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
