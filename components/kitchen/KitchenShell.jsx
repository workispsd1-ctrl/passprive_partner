"use client";

import { useEffect, useRef, useState } from "react";
import KitchenTopbar from "./KitchenTopbar";
import KitchenSidebar from "./KitchenSidebar";

export default function KitchenShell({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const prefLoadedRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("kitchen_sidebar_collapsed");
    const rafId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(stored === "true");
      prefLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!prefLoadedRef.current) return;
    window.localStorage.setItem("kitchen_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex h-screen flex-col">
        <KitchenTopbar />
        <div className="flex flex-1 overflow-hidden">
          <KitchenSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />
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
