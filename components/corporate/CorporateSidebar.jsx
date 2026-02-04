"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function CorporateSidebar({ isMobileOpen, closeMobileMenu }) {
  const [activeMenu, setActiveMenu] = useState("dashboard");

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/corporate/dashboard",
    },
    {
      id: "employees",
      label: "Employees Passes",
      href: "/corporate/employeeaccess",
    },
    {
      id: "reports",
      label: "Reports",
      href: "/corporate/reports",
    },
    {
      id: "billing",
      label: "Billing & Payments",
      href: "/corporate/billingspayment",
    },
    {
      id: "settings",
      label: "Settings",
      href: "/corporate/settings",
    },
    {
      id: "support",
      label: "Support",
      href: "/corporate/support",
    },
    {
      id: "signout",
      label: "Sign Out",
      href: "/sign-out",
    },
  ];

  const handleMenuClick = (itemId) => {
    setActiveMenu(itemId);
    if (closeMobileMenu) closeMobileMenu();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}
      
      {/* Sidebar */}
      <aside className={[
        "fixed lg:sticky top-0 h-screen bg-white z-50 transition-transform duration-300 overflow-y-auto",
        "lg:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      ].join(" ")} style={{ width: "min(280px, 90vw)" }}>
      {/* Brand */}
      <div className="pt-6 lg:pt-8 pb-4 lg:pb-6 px-4 lg:px-6 flex items-center justify-between">
        <h1 
          className="font-bold text-2xl lg:text-[32px]" 
          style={{ 
            lineHeight: "140%", 
            color: "#151D48",
            fontFamily: "Satoshi, sans-serif"
          }}
        >
          PassPrive
        </h1>
        
        {/* Close button for mobile */}
        <button
          onClick={closeMobileMenu}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          aria-label="Close menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#151D48" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="px-4 lg:px-6 space-y-2 lg:space-y-3 pb-8">
        {menuItems.map((item) => {
          const active = activeMenu === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => handleMenuClick(item.id)}
              className={[
                "flex items-center gap-3 lg:gap-4 rounded-xl px-3 lg:px-4 py-2 lg:py-2.5 transition-all",
                active
                  ? "bg-[#5D5FEF] text-white shadow-[0px_20px_50px_0px_rgba(55,69,87,0.1)]"
                  : "text-[#737791] hover:bg-gray-50",
              ].join(" ")}
              style={{
                fontSize: active ? "15px" : "14px",
                fontWeight: active ? 600 : 500,
                lineHeight: "140%",
                fontFamily: "Satoshi, sans-serif",
              }}
            >
              {/* Icon */}
              <div 
                className="flex items-center justify-center flex-shrink-0" 
                style={{ 
                  width: "24px", 
                  height: "24px"
                }}
              >
                {item.id === "dashboard" && (
                  <Image 
                    src="/dashboard.png" 
                    alt="Dashboard" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "employees" && (
                  <Image 
                    src="/employeepasses.png" 
                    alt="Employee Passes" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "reports" && (
                  <Image 
                    src="/report.png" 
                    alt="Reports" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "billing" && (
                  <Image 
                    src="/billings.png" 
                    alt="Billing & Payments" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "settings" && (
                  <Image 
                    src="/settings.png" 
                    alt="Settings" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "support" && (
                  <Image 
                    src="/support.png" 
                    alt="Support" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "signout" && (
                  <Image 
                    src="/signout.png" 
                    alt="Sign Out" 
                    width={20} 
                    height={20}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
    </>
  );
}
