"use client";

import { useState } from "react";
import Image from "next/image";

export default function CorporateTopbar({ toggleMobileMenu }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header 
      className="bg-white sticky top-0 z-30 border-b border-gray-100" 
      style={{ 
        minHeight: "60px",
        height: "60px"
      }}
    >
      <div className="flex items-center justify-between lg:justify-end h-full px-4 sm:px-6 lg:px-8 gap-3 sm:gap-4 lg:gap-6">
        
        {/* Mobile Menu Button */}
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#151D48" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        
        {/* Search Bar */}
        <div 
          className="hidden md:flex items-center gap-2 rounded-2xl flex-1 max-w-lg" 
          style={{
            height: "40px",
            background: "#F9FAFB",
            paddingTop: "2px",
            paddingRight: "16px",
            paddingBottom: "2px",
            paddingLeft: "12px",
            borderRadius: "12px"
          }}
        >
          {/* Search Icon */}
          <div style={{ width: "20px", height: "20px" }} className="flex items-center justify-center flex-shrink-0">
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none"
            >
              <circle cx="11" cy="11" r="8" stroke="#5D5FEF" strokeWidth="2" fill="none"/>
              <path d="M21 21l-4.35-4.35" stroke="#5D5FEF" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          
          <input
            type="text"
            placeholder="Search here..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[#737791] min-w-0"
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "100%"
            }}
          />
        </div>

        {/* Notification Bell */}
        <button
          className="flex items-center justify-center rounded-xl hover:bg-gray-50 transition flex-shrink-0"
          type="button"
          aria-label="Notifications"
          style={{ width: "36px", height: "36px" }}
        >
          <Image 
            src="/Notifications.png" 
            alt="Notifications" 
            width={28} 
            height={28}
          />
        </button>

        {/* User Profile */}
        <div 
          className="flex items-center gap-2 lg:gap-3 flex-shrink-0"
        >
          {/* Profile Image */}
          <Image
            src="/Rectangle 1393.png"
            alt="Profile"
            width={40}
            height={40}
            className="object-cover flex-shrink-0"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px"
            }}
          />
          
          {/* User Info */}
          <div className="hidden sm:flex flex-col justify-center min-w-0">
            <p 
              className="text-gray-900 truncate"
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 500,
                fontSize: "14px",
                lineHeight: "1.5"
              }}
            >
              Bharat
            </p>
            <p 
              className="text-gray-500 truncate"
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 400,
                fontSize: "12px"
              }}
            >
              Admin
            </p>
          </div>

          {/* Dropdown Arrow */}
          <svg className="hidden sm:block flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="#737791" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </header>
  );
}
