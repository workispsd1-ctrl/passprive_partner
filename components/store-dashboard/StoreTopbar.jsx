"use client";

import { Bell, Search, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function StoreTopbar() {
  const router = useRouter();

  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <div className="font-semibold text-gray-900">
            Store Partner Dashboard
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              className="w-72 text-sm outline-none placeholder:text-gray-400"
              placeholder="Search orders, products..."
            />
          </div>

          <button
            className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            type="button"
          >
            <Bell className="h-4 w-4 text-gray-700" />
          </button>

          <button
            onClick={onLogout}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
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
