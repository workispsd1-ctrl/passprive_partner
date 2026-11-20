"use client";

import WaiterTopbar from "./WaiterTopbar";
import WaiterOrderNotifier from "./WaiterOrderNotifier";

export default function WaiterShell({ children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <WaiterTopbar />
      <section className="flex-1 p-4 sm:p-6">{children}</section>
      {/* Floor-wide alerts: soft new-order ping + Take-Table modal, loud Ready-to-Serve */}
      <WaiterOrderNotifier />
    </main>
  );
}
