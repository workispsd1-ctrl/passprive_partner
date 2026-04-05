"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaymentOrdersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/store-partner/dashboard");
  }, [router]);

  return null;
}
