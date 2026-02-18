"use client";

import { useEffect, useState } from "react";
import { fetchDashboardKPIs, fetchRecentActivity } from "./dashboardMetrics";

export function useDashboard(storeId) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [k, a] = await Promise.all([
          fetchDashboardKPIs(storeId),
          fetchRecentActivity(storeId),
        ]);

        if (!mounted) return;
        setKpis(k);
        setActivity(a);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [storeId]);

  return { loading, kpis, activity, error };
}
