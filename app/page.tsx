"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Loader from '@/app/(auth)/callback/loading'

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabaseBrowser.auth.getUser();

      if (data.user) {
        router.replace("/callback");
      } else {
        router.replace("/sign-in");
      }
    };

    checkUser();
  }, [router]);

  return <div className="flex justify-center items-center mt-20">
    <Loader />
  </div>;
}
