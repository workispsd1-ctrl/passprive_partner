"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BearerDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/restaurant/bearer/table-orders");
  }, [router]);

  return null;
}
