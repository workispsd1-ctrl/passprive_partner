"use client";

import { useEffect, useState } from "react";
import RestaurantShell from "./RestaurantShell";
import { RESTAURANT_CHANGED_EVENT, getSavedRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

export default function RestaurantScope({ children }) {
  const [scopeKey, setScopeKey] = useState(() => getSavedRestaurantId() || "default");

  useEffect(() => {
    const onChange = (e) => {
      setScopeKey(String(e.detail || "default"));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener(RESTAURANT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RESTAURANT_CHANGED_EVENT, onChange);
  }, []);

  return <RestaurantShell key={scopeKey}>{children}</RestaurantShell>;
}
