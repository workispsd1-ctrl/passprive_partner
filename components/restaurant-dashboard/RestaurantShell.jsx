"use client";

import { useEffect, useState } from "react";
import RestaurantSidebar from "./RestaurantSidebar";
import RestaurantTopbar from "./RestaurantTopbar";

export default function RestaurantShell({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("restaurant_sidebar_collapsed") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("restaurant_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ ["--accent"]: "#C59D5F" }} // gold accent
    >
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
