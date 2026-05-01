"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const SESSION_MAX_MS = 8 * 60 * 60 * 1000;

function isPublicPath(pathname: string) {
  if (!pathname) return true;
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/staff-pin") ||
    pathname.startsWith("/callback") ||
    pathname.startsWith("/public-menu")
  );
}

export default function SessionTimeoutGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;

    async function enforceTimeout() {
      if (busy || isPublicPath(pathname || "")) return;
      busy = true;
      try {
        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error || !data?.session) {
          busy = false;
          return;
        }

        const lastSignInAt = data.session.user?.last_sign_in_at
          ? new Date(data.session.user.last_sign_in_at).getTime()
          : null;

        if (!Number.isFinite(lastSignInAt || NaN)) {
          busy = false;
          return;
        }

        const elapsed = Date.now() - Number(lastSignInAt);
        if (elapsed >= SESSION_MAX_MS) {
          await supabaseBrowser.auth.signOut();
          router.replace("/sign-in?reason=session_expired");
        }
      } finally {
        busy = false;
      }
    }

    enforceTimeout();
    timer = setInterval(enforceTimeout, 60 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") enforceTimeout();
    };

    window.addEventListener("focus", enforceTimeout);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", enforceTimeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, router]);

  return null;
}
