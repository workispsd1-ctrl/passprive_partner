"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import KitchenTopbar from "./KitchenTopbar";
import KitchenSidebar from "./KitchenSidebar";

export default function KitchenShell({ children }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPrefLoadedRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("kitchen_sidebar_collapsed");
    const next = stored === "true";
    const rafId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(next);
      sidebarPrefLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!sidebarPrefLoadedRef.current) return;
    window.localStorage.setItem("kitchen_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex h-screen flex-col">
        <KitchenTopbar />
        <div className="flex flex-1 overflow-hidden">
          <KitchenSidebar collapsed={sidebarCollapsed} />
          <main className="flex-1 overflow-auto">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
