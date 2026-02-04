"use client";

import { useState } from "react";
import CorporateSidebar from "./CorporateSidebar";
import CorporateTopbar from "./CorporateTopbar";

export default function CorporateShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

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
