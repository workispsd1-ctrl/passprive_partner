"use client";

import { useEffect, useState } from "react";
import PosTerminalsPanel from "@/components/pos/PosTerminalsPanel";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

export default function RestaurantPosPage() {
  const [restaurantId, setRestaurantId] = useState(null);

  useEffect(() => {
    getActiveRestaurantId().then(setRestaurantId).catch(() => setRestaurantId(null));
  }, []);

  if (!restaurantId) return <div className="h-40 rounded-3xl bg-gray-100 animate-pulse" />;
  return <PosTerminalsPanel restaurantId={restaurantId} />;
}
