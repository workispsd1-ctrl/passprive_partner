"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const DESKTOP_QUERY = "(min-width: 1024px)";

// Off-canvas sidebar state for < lg screens: closes on navigation, Escape,
// and when the viewport grows to desktop; locks page scroll while open.
export function useMobileNav() {
  const pathname = usePathname();
  // Remember which route the drawer was opened on; navigating away closes it.
  const [openedOn, setOpenedOn] = useState(null);
  const open = openedOn !== null && openedOn === pathname;
  const setOpen = useCallback((next) => setOpenedOn(next ? pathname : null), [pathname]);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => {
      if (e.matches) setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    mq.addEventListener("change", onChange);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      mq.removeEventListener("change", onChange);
    };
  }, [open, setOpen]);

  return { open, close, toggle };
}

export function MobileNavBackdrop({ open, onClose }) {
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    />
  );
}

export function MobileMenuButton({ onClick, open = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation menu"
      aria-expanded={open}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 lg:hidden ${className}`}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

// Shared classes for a sidebar <aside> that is a slide-in drawer below lg
// and a sticky column on desktop.
export function drawerAsideClass(open) {
  return [
    "fixed inset-y-0 left-0 z-50 flex flex-col h-dvh w-[17.5rem] max-w-[85vw]",
    "transition-[transform,width,visibility] duration-300 ease-out",
    // invisible keeps the closed drawer out of the tab order on mobile
    open ? "translate-x-0 shadow-2xl" : "invisible -translate-x-full",
    "lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0 lg:shadow-none",
  ].join(" ");
}
