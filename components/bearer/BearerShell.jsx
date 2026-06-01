"use client";

import BearerTopbar from "./BearerTopbar";
import BearerOrderNotifier from "./BearerOrderNotifier";

export default function BearerShell({ children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <BearerTopbar />
      <section className="flex-1 p-4 sm:p-6">{children}</section>
      {/* Floor-wide alerts: soft new-order ping + Take-Table modal, loud Ready-to-Serve */}
      <BearerOrderNotifier />
    </main>
  );
}
