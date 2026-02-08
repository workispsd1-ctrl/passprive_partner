"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMyStores } from "./stores";

const LS_KEY = "store_partner_selected_store_id";

export function useStores() {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const list = await fetchMyStores();
        if (!mounted) return;

        setStores(list);

        const saved =
          typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;

        const firstId = list?.[0]?.id || null;
        const validSaved =
          saved && list.some((s) => s.id === saved) ? saved : null;

        const nextId = validSaved || firstId;

        setSelectedStoreId(nextId);

        if (typeof window !== "undefined" && nextId) {
          localStorage.setItem(LS_KEY, nextId);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load stores");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  function changeStore(id) {
    setSelectedStoreId(id);
    if (typeof window !== "undefined" && id) localStorage.setItem(LS_KEY, id);
  }

  return {
    loading,
    stores,
    selectedStoreId,
    selectedStore,
    error,
    changeStore,
  };
}
