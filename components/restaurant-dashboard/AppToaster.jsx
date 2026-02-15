"use client";

import { useEffect, useState } from "react";

export default function AppToaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      if (!t?.id) return;

      setToasts((prev) => [...prev, t]);

      const ms = Number(t.duration || 4000);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, ms);
    };

    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  const tone = (type) => {
    if (type === "success") return "bg-emerald-50 border-emerald-200 text-emerald-800";
    if (type === "error") return "bg-rose-50 border-rose-200 text-rose-800";
    if (type === "warning") return "bg-amber-50 border-amber-200 text-amber-800";
    return "bg-slate-50 border-slate-200 text-slate-800";
  };

  return (
    <div className="fixed top-4 right-4 z-[120] flex w-[360px] max-w-[92vw] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-3 shadow-sm ${tone(t.type)}`}
        >
          {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
          {t.description ? <div className="mt-1 text-xs">{t.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
