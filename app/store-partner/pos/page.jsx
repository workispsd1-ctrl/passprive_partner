"use client";

import PosTerminalsPanel from "@/components/pos/PosTerminalsPanel";
import { useStores } from "@/lib/store-partner/useStores";

export default function StorePosPage() {
  const { selectedStoreId, loading } = useStores();

  if (loading || !selectedStoreId) return <div className="h-40 rounded-3xl bg-gray-100 animate-pulse" />;
  return <PosTerminalsPanel storeId={selectedStoreId} />;
}
