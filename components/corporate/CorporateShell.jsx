"use client";

import CorporateSidebar from "./CorporateSidebar";
import CorporateTopbar from "./CorporateTopbar";
import { useMobileNav } from "@/components/ui/MobileNav";

export default function CorporateShell({ children }) {
  const { open: isMobileMenuOpen, toggle: toggleMobileMenu, close: closeMobileMenu } = useMobileNav();

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900"
      style={{ ["--accent"]: "#C59D5F" }} // gold accent
    >
      <div className="flex">
        <CorporateSidebar isMobileOpen={isMobileMenuOpen} closeMobileMenu={closeMobileMenu} />

        <div className="flex-1 min-w-0 lg:ml-0">
          <CorporateTopbar toggleMobileMenu={toggleMobileMenu} />
          <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
