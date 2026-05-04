"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  LayoutGrid,
  QrCode,
  RefreshCcw,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const tabs = [
  { href: "/restaurant/bearer/dashboard",    label: "Dashboard",    icon: LayoutGrid },
  { href: "/restaurant/bearer/table-orders", label: "Table Orders", icon: QrCode },
];

const tabStyles = {
  "/restaurant/bearer/dashboard": {
    active: "border-violet-700 bg-violet-600 text-white",
    idle:   "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
  },
  "/restaurant/bearer/table-orders": {
    active: "border-emerald-700 bg-emerald-600 text-white",
    idle:   "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
};

export default function BearerTopbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [profile, setProfile] = useState({
    restaurant_name: "Restaurant",
    operator_name:   "Bearer",
    restaurant_logo: "",
  });

  useEffect(() => {
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    if (typeof window !== "undefined") {
      setIsConnected(window.navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) { router.push("/sign-in"); return; }

        const deviceId = localStorage.getItem("staff_device_id") || "";
        const url = new URL("/api/bearer/profile", window.location.origin);
        if (deviceId) url.searchParams.set("device_id", deviceId);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();

        if (!res.ok || !payload?.ok) {
           console.error("Profile fetch failed:", payload?.error);
           return;
        }

        if (isMounted) {
          setProfile({
            restaurant_name: payload?.restaurant?.name  || "Restaurant",
            operator_name:   payload?.operator_name     || "Staff",
            restaurant_logo: payload?.restaurant?.cover_image || "",
          });
          setIsDeviceAuthorized(payload?.is_device_authorized ?? true);
        }
      } catch (err) {
        console.error("Profile effect error:", err);
      }
    })();
    return () => { isMounted = false; };
  }, [router]);

  const activeTab = useMemo(
    () =>
      tabs.find(
        (t) => pathname === t.href || pathname.startsWith(t.href + "/")
      )?.href || "",
    [pathname]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      window.dispatchEvent(new CustomEvent("bearer:refresh"));
      router.refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), 500);
    }
  };

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await supabaseBrowser.auth.signOut();
      router.replace("/sign-in");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 mb-5 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="px-4 sm:px-5 py-4 flex flex-col gap-3">
        {/* Top row: logo + name + actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-xl overflow-hidden border border-slate-200 bg-[#F4E7D1] flex items-center justify-center shrink-0">
              {profile.restaurant_logo ? (
                <img
                  src={profile.restaurant_logo}
                  alt="Restaurant logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-lg font-bold text-[#771FA8]">B</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {profile.restaurant_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-500 truncate">
                   {profile.operator_name} (Bearer)
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                    isConnected 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}>
                    {isConnected ? (
                      <><Wifi className="h-2.5 w-2.5" /> Connected</>
                    ) : (
                      <><WifiOff className="h-2.5 w-2.5" /> Offline</>
                    )}
                  </span>
                  {!isDeviceAuthorized && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-amber-50 text-amber-700 border-amber-200">
                      <AlertTriangle className="h-2.5 w-2.5" /> Unpaired Device
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="h-10 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{loggingOut ? "Logging out..." : "Logout"}</span>
            </button>
          </div>
        </div>

        {/* Tab nav row */}
        <nav className="flex flex-wrap gap-5">
          {tabs.map((tab) => {
            const active = activeTab === tab.href;
            const Icon = tab.icon;
            const palette = tabStyles[tab.href] || {
              active: "border-slate-700 bg-slate-600 text-white",
              idle:   "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            };
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`h-10 rounded-xl px-3 text-sm font-semibold inline-flex items-center gap-2 border transition ${
                  active ? palette.active : palette.idle
                }`}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
