"use client";

import { useEffect, useRef, useState } from "react";
import CashierTopNav from "@/components/cashier/CashierTopNav";
import CashierAlertNotifier from "@/components/cashier/CashierAlertNotifier";
import CashierSidebar from "@/components/cashier/CashierSidebar";
import DashboardAccessGuard from "@/components/auth/DashboardAccessGuard";

export default function CashierLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const prefLoadedRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("cashier_sidebar_collapsed");
    const next = stored === "true";
    const rafId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(next);
      prefLoadedRef.current = true;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!prefLoadedRef.current) return;
    window.localStorage.setItem("cashier_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <DashboardAccessGuard scope="cashier">
      <main className="min-h-screen bg-[#f6f7fb] text-slate-900 lg:flex">
        <CashierSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} />
        <div className="flex-1 min-w-0 p-4 sm:p-6">
          <CashierTopNav />
          <CashierAlertNotifier />
          <section>{children}</section>
        </div>
      </main>
    </DashboardAccessGuard>
  );
}
