"use client";

import { Bell, LogOut } from "lucide-react";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TITLE_BY_ROUTE = [
  { prefix: "/store-partner/all-stores", title: "My Stores" },
   { prefix: "/store-partner/all-stores/add", title: "Add Store" },
  { prefix: "/store-partner/offers", title: "Offers" },
  { prefix: "/store-partner/catalogue", title: "Catalogue" },
  { prefix: "/store-partner/reviews", title: "Reviews" },
  { prefix: "/store-partner/payouts", title: "Payouts" },
  { prefix: "/store-partner/settings", title: "Settings" },
  { prefix: "/store-partner/dashboard", title: "Dashboard" },
];



export default function StoreTopbar() {
  const router = useRouter();
  const pathname = usePathname();


  

 const pageTitle = useMemo(() => {
  if (/^\/store-partner\/all-stores\/[^/]+\/edit$/.test(pathname)) {
    return "Edit Store";
  }

  if (/^\/store-partner\/all-stores\/[^/]+$/.test(pathname)) {
    return "Store Details";
  }

  const match = TITLE_BY_ROUTE.reduce((best, item) => {
    const isMatch = pathname === item.prefix || pathname.startsWith(item.prefix + "/");
    if (!isMatch) return best;
    if (!best || item.prefix.length > best.prefix.length) return item;
    return best;
  }, null);

  return match?.title || "Dashboard";
}, [pathname]);


  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Title */}
        <div className="min-w-0">
          
          <div className="text-xl font-bold text-gray-900 truncate">{pageTitle}</div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            type="button"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-gray-700" />
          </button>

          <button
            onClick={onLogout}
            className="h-10 rounded-xl border border-gray-200 bg-red-600 hover:bg-red-500 text-white px-3 text-sm font-medium flex items-center gap-2 cursor-pointer"
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
