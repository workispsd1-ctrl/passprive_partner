"use client";

import BearerTopbar from "./BearerTopbar";

export default function BearerShell({ children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <BearerTopbar />
      <section className="flex-1 p-4 sm:p-6">{children}</section>
    </main>
  );
}
