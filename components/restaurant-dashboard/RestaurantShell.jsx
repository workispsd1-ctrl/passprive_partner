"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import RestaurantSidebar from "./RestaurantSidebar";
import RestaurantTopbar from "./RestaurantTopbar";
import BookingAlertNotifier from "./BookingAlertNotifier";
import TableOrderAlertNotifier from "./TableOrderAlertNotifier";
import LockedPage from "./LockedPage";
import { fetchRestaurantPlan, isRouteLocked } from "@/lib/restaurant-partner/plan";
import { useMobileNav } from "@/components/ui/MobileNav";

export default function RestaurantShell({ children }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [planInfo, setPlanInfo] = useState(null);
  const mobileNav = useMobileNav();

  useEffect(() => {
    let mounted = true;
    fetchRestaurantPlan()
      .then((info) => mounted && setPlanInfo(info))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const locked = isRouteLocked(planInfo?.plan, pathname);
  const content = locked ? (
    <LockedPage
      plan={planInfo.plan}
      restaurantId={planInfo.restaurantId}
      showDeals={planInfo.plan === "deals" && pathname === "/restaurant/dashboard"}
    >
      {children}
    </LockedPage>
  ) : (
    children
  );
  const sidebarPrefLoadedRef = useRef(false);
  const isRoleStandalone =
    pathname?.startsWith("/restaurant/kitchen") || pathname?.startsWith("/restaurant/bearer");

  useEffect(() => {
    const stored = window.localStorage.getItem("restaurant_sidebar_collapsed");
    const next = stored === "true";
    const rafId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(next);
      sidebarPrefLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!sidebarPrefLoadedRef.current) return;
    window.localStorage.setItem("restaurant_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (isRoleStandalone) {
    return (
      <div className="min-h-screen bg-white text-gray-900" style={{ ["--accent"]: "#C59D5F" }}>
        <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ ["--accent"]: "#C59D5F" }} // gold accent
    >
      <BookingAlertNotifier />
      <TableOrderAlertNotifier />
      <div className="flex">
        <RestaurantSidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNav.open}
          onMobileClose={mobileNav.close}
        />

        <div className="flex-1 min-w-0">
          <RestaurantTopbar
            collapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
            mobileNavOpen={mobileNav.open}
            onOpenMobileNav={mobileNav.toggle}
          />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{content}</main>
        </div>
      </div>
    </div>
  );
}
