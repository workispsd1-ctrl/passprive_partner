"use client";

export function showToast({ type = "info", title = "", description = "", duration = 4000 }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app-toast", {
      detail: {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type,
        title,
        description,
        duration,
      },
    })
  );
}
