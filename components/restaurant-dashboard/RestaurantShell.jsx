"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import RestaurantSidebar from "./RestaurantSidebar";
import RestaurantTopbar from "./RestaurantTopbar";
import BookingAlertNotifier from "./BookingAlertNotifier";
import TableOrderAlertNotifier from "./TableOrderAlertNotifier";

export default function RestaurantShell({ children }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
        <RestaurantSidebar collapsed={sidebarCollapsed} />

        <div className="flex-1 min-w-0">
          <RestaurantTopbar
            collapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
