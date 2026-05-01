"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function resolveTargetForRole(role) {
  if (role === "storepartner" || role === "storemanager") return "/store-partner/dashboard";
  if (role === "restaurantpartner") return "/restaurant/dashboard";
  if (role === "cashier" || role === "restaurant_cashier") return "/cashier/dashboard";
  if (role === "restaurant_kitchen") return "/restaurant/kitchen/dashboard";
  if (role === "restaurant_bearer") return "/restaurant/bearer/dashboard";
  if (role === "corporateadmin") return "/corporate/dashboard";
  return "/sign-in";
}

function isAllowed(scope, role, pathname) {
  if (scope === "cashier") return role === "cashier" || role === "restaurant_cashier";
  if (scope === "store") return role === "storepartner" || role === "storemanager";
  if (scope === "corporate") return role === "corporateadmin";

  if (scope === "restaurant") {
    if (role === "restaurantpartner") return true;
    if (role === "restaurant_kitchen") return String(pathname || "").startsWith("/restaurant/kitchen");
    if (role === "restaurant_bearer") return String(pathname || "").startsWith("/restaurant/bearer");
    return false;
  }

  return false;
}

export default function DashboardAccessGuard({ scope, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error || !data?.session?.user?.id) {
          if (!mounted) return;
          setAllowed(false);
          setReady(true);
          router.replace("/sign-in");
          return;
        }

        const userId = data.session.user.id;
        const { data: userRow, error: roleErr } = await supabaseBrowser
          .from("users")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (roleErr) {
          if (!mounted) return;
          setAllowed(false);
          setReady(true);
          router.replace("/sign-in");
          return;
        }

        const role = normalizeRole(userRow?.role);
        const ok = isAllowed(scope, role, pathname);
        if (!mounted) return;

        setAllowed(ok);
        setReady(true);

        if (!ok) {
          router.replace(resolveTargetForRole(role));
        }
      } catch {
        if (!mounted) return;
        setAllowed(false);
        setReady(true);
        router.replace("/sign-in");
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [pathname, router, scope]);

  if (!ready) {
    return <div className="min-h-[50vh] grid place-items-center text-sm text-slate-500">Checking access...</div>;
  }

  if (!allowed) return null;
  return children;
}
