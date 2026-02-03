"use client";

import { Bell, Search, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TITLE_MAP = {
  "/restaurant/dashboard": "Dashboard",
  "/restaurant/bookings": "Bookings",
  "/restaurant/menu": "Menu",
  "/restaurant/offers": "Offers",
  "/restaurant/reviews": "Reviews",
  "/restaurant/analytics": "Analytics",
  "/restaurant/payouts": "Payouts",
  "/restaurant/settings": "Settings",
};

function getTitleFromPath(pathname) {
  // Handle nested routes like /restaurant-dashboard/bookings/123
  const parts = pathname.split("/").filter(Boolean); // ["restaurant-dashboard","bookings","123"]
  if (parts.length <= 1) return "Dashboard";

  const base = `/${parts[0]}/${parts[1]}`; // "/restaurant-dashboard/bookings"
  return TITLE_MAP[base] || "Dashboard";
}

export default function RestaurantTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const title = getTitleFromPath(pathname);

  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
         
          <div className="font-bold text-gray-900 text-xl">{title}</div>
        </div>

        <div className="flex items-center gap-3">
        
          

          <button
            className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            type="button"
          >
            <Bell className="h-4 w-4 text-gray-700" />
          </button>

          <button
            onClick={onLogout}
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 bg-red-500 text-white"
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
