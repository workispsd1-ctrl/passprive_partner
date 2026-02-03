"use client";

import { Loader } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { verifyUser } from "@/store/features/admin/adminSlice";
import { useAppDispatch } from "@/store/hooks";

const ALLOWED_ROLES = new Set(["storepartner", "restaurantpartner"]);

const AuthCallbackPage = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {

        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error) throw error;

        const session = data.session;
        const token = session?.access_token;
        const authUser = session?.user;

        if (!token || !authUser) {
          if (!cancelled) router.replace("/sign-in");
          return;
        }

       
        const result = await dispatch(verifyUser(token));

        if (!verifyUser.fulfilled.match(result)) {
          await supabaseBrowser.auth.signOut();
          if (!cancelled) router.replace("/sign-in");
          return;
        }

        const { data: userRow, error: roleErr } = await supabaseBrowser
          .from("users")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();

        if (roleErr) {
          await supabaseBrowser.auth.signOut();
          if (!cancelled) router.replace("/sign-in");
          return;
        }

        const role = String(userRow?.role || "").toLowerCase();

        // 4) Route by role
        if (!ALLOWED_ROLES.has(role)) {
          await supabaseBrowser.auth.signOut();
          if (!cancelled) router.replace("/sign-in?error=access_denied");
          return;
        }

        if (role === "storepartner") {
          if (!cancelled) router.replace("/store/dashboard");
          return;
        }

        if (role === "restaurantpartner") {
          if (!cancelled) router.replace("/restaurant/dashboard");
          return;
        }

        // Fallback
        if (!cancelled) router.replace("/sign-in");
      } catch (e) {
        await supabaseBrowser.auth.signOut();
        if (!cancelled) router.replace("/sign-in");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader className="h-10 w-10 animate-spin text-blue-600" />
        <h3 className="text-xl font-bold">Authenticating...</h3>
        <p>Please wait while we verify your credentials</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
