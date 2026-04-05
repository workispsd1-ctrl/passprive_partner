"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchDashboardKPIs, fetchRecentActivity } from "./dashboardMetrics";

export function useDashboard(storeId, filters) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let pollId = null;

    const loadDashboard = async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const [k, a] = await Promise.all([
          fetchDashboardKPIs(storeId, filters),
          fetchRecentActivity(storeId),
        ]);

        if (cancelled) return;
        setKpis(k);
        setActivity(a);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Failed to load dashboard");
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    loadDashboard(false);

    if (!storeId) {
      return () => {
        cancelled = true;
      };
    }

    const filter = `store_id=eq.${storeId}`;
    const channel = supabaseBrowser
      .channel(`dashboard-payment-sessions-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_sessions",
          filter,
        },
        () => {
          loadDashboard(true);
        }
      )
      .subscribe();

    pollId = window.setInterval(() => {
      loadDashboard(true);
    }, 10000);

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      supabaseBrowser.removeChannel(channel);
    };
  }, [storeId, filters]);

  return { loading, kpis, activity, error };
}
