"use client";

import RestaurantSidebar from "./RestaurantSidebar";
import RestaurantTopbar from "./RestaurantTopbar";

export default function RestaurantShell({ children }) {
  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ ["--accent"]: "#C59D5F" }} // gold accent
    >
      <div className="flex">
        <RestaurantSidebar />

        <div className="flex-1 min-w-0">
          <RestaurantTopbar />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
