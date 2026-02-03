"use client";

import StoreSidebar from "./StoreSidebar";
import StoreTopbar from "./StoreTopbar";

export default function StoreShell({ children }) {
  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ ["--accent"]: "#3F6DF2" }} // blue accent
    >
      <div className="flex">
        <StoreSidebar />

        <div className="flex-1 min-w-0">
          <StoreTopbar />
          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
