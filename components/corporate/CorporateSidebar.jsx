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
      ].join(" ")} style={{ width: "min(378px, 90vw)" }}>
      {/* Brand */}
      <div className="pt-8 lg:pt-14 pb-6 lg:pb-10 px-6 lg:px-12 flex items-center justify-between">
        <h1 
          className="font-bold text-3xl lg:text-[44px]" 
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
      <nav className="px-6 lg:px-12 space-y-4 lg:space-y-8 pb-8">
        {menuItems.map((item) => {
          const active = activeMenu === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => handleMenuClick(item.id)}
              className={[
                "flex items-center gap-4 lg:gap-6 rounded-2xl px-4 lg:px-6 py-3 lg:py-4 transition-all",
                active
                  ? "bg-[#5D5FEF] text-white shadow-[0px_20px_50px_0px_rgba(55,69,87,0.1)]"
                  : "text-[#737791] hover:bg-gray-50",
              ].join(" ")}
              style={{
                maxWidth: "252px",
                minHeight: "56px",
                fontSize: active ? "clamp(18px, 4vw, 23px)" : "clamp(16px, 3.5vw, 18px)",
                fontWeight: active ? 700 : 500,
                lineHeight: "140%",
                fontFamily: "Satoshi, sans-serif",
              }}
            >
              {/* Icon */}
              <div 
                className="flex items-center justify-center flex-shrink-0" 
                style={{ 
                  width: "32px", 
                  height: "32px",
                  border: active && item.id === "dashboard" ? "2px solid #FFFFFF" : active ? "2px solid white" : "none",
                  borderRadius: "50%"
                }}
              >
                {item.id === "dashboard" && (
                  <Image 
                    src="/dashboardside.png" 
                    alt="Dashboard" 
                    width={28} 
                    height={28}
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
                    width={28} 
                    height={28}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "reports" && (
                  <Image 
                    src="/Report.png" 
                    alt="Reports" 
                    width={28} 
                    height={28}
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
                    width={28} 
                    height={28}
                    style={{
                      filter: active ? "brightness(0) invert(1)" : "none",
                      opacity: active ? 1 : 0.6
                    }}
                  />
                )}
                {item.id === "settings" && (
                  <Image 
                    src="/seetings.png" 
                    alt="Settings" 
                    width={28} 
                    height={28}
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
                    width={28} 
                    height={28}
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
                    width={28} 
                    height={28}
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
