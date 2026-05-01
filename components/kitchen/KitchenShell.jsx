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
    window.localStorage.setItem(
      "kitchen_sidebar_collapsed",
      String(sidebarCollapsed)
    );
  }, [sidebarCollapsed]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-900 lg:flex">
      <KitchenSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />
      <div className="flex-1 min-w-0 p-4 sm:p-6">
        <KitchenTopbar />
        <section>{children}</section>
      </div>
    </main>
  );
}
