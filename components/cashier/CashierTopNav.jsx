"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LayoutGrid, CalendarCheck, QrCode, Package2, RefreshCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const tabs = [
  { href: "/cashier/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/cashier/orders", label: "Make Order", icon: Package2 },
  { href: "/cashier/bookings", label: "DineIn Bookings", icon: CalendarCheck },
  { href: "/cashier/table-orders", label: "QR Orders", icon: QrCode },
  { href: "/cashier/pickup-orders", label: "Pickup", icon: Package2 },
];

const tabStyles = {
  "/cashier/dashboard": {
    active: "border-violet-700 bg-violet-600 text-white",
    idle: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
  },
  "/cashier/orders": {
    active: "border-sky-700 bg-sky-600 text-white",
    idle: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
  },
  "/cashier/bookings": {
    active: "border-amber-700 bg-amber-600 text-white",
    idle: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  },
  "/cashier/table-orders": {
    active: "border-emerald-700 bg-emerald-600 text-white",
    idle: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
  "/cashier/pickup-orders": {
    active: "border-rose-700 bg-rose-600 text-white",
    idle: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  },
};

export default function CashierTopNav() {
  const pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const [showScrollTabs, setShowScrollTabs] = useState(pathname !== "/cashier/dashboard");
  const [profile, setProfile] = useState({ restaurant_name: "Restaurant", user_name: "Cashier", restaurant_logo: "" });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabaseBrowser.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/cashier/dashboard", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (res.ok && json?.ok && json?.profile) {
          setProfile({
            restaurant_name: json.profile.restaurant_name || "Restaurant",
            user_name: json.profile.user_name || "Cashier",
            restaurant_logo: json.profile.restaurant_logo || "",
          });
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (pathname !== "/cashier/dashboard") {
      setShowScrollTabs(true);
      return;
    }

    const onScroll = () => {
      // Reveal compact nav tabs once KPI tile section is passed.
      setShowScrollTabs(window.scrollY > 340);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  const activeTab = useMemo(() => tabs.find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.href || "", [pathname]);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await supabaseBrowser.auth.signOut();
      router.replace("/sign-in");
    } finally {
      setLoggingOut(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      window.dispatchEvent(new CustomEvent("cashier:refresh"));
      router.refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <header className="sticky top-0 z-40 mb-5 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="px-4 sm:px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-xl overflow-hidden border border-slate-200 bg-[#F4E7D1] flex items-center justify-center shrink-0">
              {profile.restaurant_logo ? (
                <img src={profile.restaurant_logo} alt="Restaurant logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-[#771FA8]">R</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{profile.restaurant_name} Till</h1>
              <p className="text-xs text-slate-500 truncate">Operator: {profile.user_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="h-10 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" /> {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>

        {showScrollTabs ? (
          <nav className="flex flex-wrap gap-5">
            {tabs.map((tab) => {
              const active = activeTab === tab.href;
              const Icon = tab.icon;
              const palette = tabStyles[tab.href] || {
                active: "border-slate-700 bg-slate-600 text-white",
                idle: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              };
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`h-10 rounded-xl px-3 text-sm font-semibold inline-flex items-center gap-2 border transition ${
                    active
                      ? palette.active
                      : palette.idle
                  }`}
                >
                  <Icon className="h-4 w-4" /> {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
