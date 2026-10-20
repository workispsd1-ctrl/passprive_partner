"use client";

import StoreSidebar from "./StoreSidebar";
import StoreTopbar from "./StoreTopbar";
import { useMobileNav } from "@/components/ui/MobileNav";

export default function StoreShell({ children }) {
  const mobileNav = useMobileNav();

  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ ["--accent"]: "#3F6DF2" }} // blue accent
    >
      <div className="flex">
        <StoreSidebar mobileOpen={mobileNav.open} onMobileClose={mobileNav.close} />

        <div className="flex-1 min-w-0">
          <StoreTopbar mobileNavOpen={mobileNav.open} onOpenMobileNav={mobileNav.toggle} />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
