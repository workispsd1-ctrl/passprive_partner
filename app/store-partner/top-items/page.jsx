"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Star, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchMyStores } from "@/lib/store-partner/stores";

const ACTIVE_STORE_KEY = "store_partner_selected_store_id";

function Card({ title, subtitle, children, right }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}
        </div>
        {right || null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function TopItemsPage() {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [topItems, setTopItems] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === String(selectedStoreId)) || null,
    [stores, selectedStoreId]
  );

  const persistSelectedStore = (id) => {
    try {
      localStorage.setItem(ACTIVE_STORE_KEY, String(id));
      window.dispatchEvent(new Event("store-selection-changed"));
    } catch {}
  };

  const loadStores = async () => {
    const list = await fetchMyStores();
    return [...list].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  };

  const loadStoreTopItems = async (storeId) => {
    if (!storeId) {
      setTopItems([]);
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("stores")
      .select("id,top_items")
      .eq("id", storeId)
      .maybeSingle();

    if (error) throw error;
    setTopItems(Array.isArray(data?.top_items) ? data.top_items.filter(Boolean) : []);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setOk("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        if (!sess?.session?.user?.id) throw new Error("Please sign in again.");

        const list = await loadStores();
        if (cancelled) return;
        setStores(list);

        let preferred = "";
        try {
          preferred = localStorage.getItem(ACTIVE_STORE_KEY) || "";
        } catch {}

        const nextId = list.some((store) => String(store.id) === String(preferred))
          ? String(preferred)
          : String(list[0]?.id || "");

        setSelectedStoreId(nextId);
        if (nextId) {
          persistSelectedStore(nextId);
          await loadStoreTopItems(nextId);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load top items.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    persistSelectedStore(selectedStoreId);
    (async () => {
      try {
        setError("");
        setOk("");
        await loadStoreTopItems(selectedStoreId);
      } catch (e) {
        setError(e?.message || "Failed to load top items.");
      }
    })();
  }, [selectedStoreId]);

  const addItem = () => {
    const next = String(input || "").trim();
    if (!next) return;
    setTopItems((prev) => {
      if (prev.some((item) => String(item).toLowerCase() === next.toLowerCase())) return prev;
      return [...prev, next];
    });
    setInput("");
  };

  const removeItem = (value) => {
    setTopItems((prev) => prev.filter((item) => String(item) !== String(value)));
  };

  const saveItems = async () => {
    if (!selectedStoreId || saving) return;
    try {
      setSaving(true);
      setError("");
      setOk("");
      const cleaned = (topItems || []).map((item) => String(item || "").trim()).filter(Boolean);

      const { error } = await supabaseBrowser.from("stores").update({ top_items: cleaned }).eq("id", selectedStoreId);
      if (error) throw error;

      setOk("Top items saved.");
    } catch (e) {
      setError(e?.message || "Failed to save top items.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-4">
        <Card
          title={
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-[#771FA8]" />
              <span>Top Items</span>
            </div>
          }
          subtitle="Manage highlighted items shown for a store."
          right={
            <button
              type="button"
              onClick={saveItems}
              disabled={loading || saving || !selectedStoreId}
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          }
        >
          {loading ? (
            <div className="space-y-3">
              <div className="h-11 rounded-2xl border border-gray-200 bg-gray-100" />
              <div className="h-20 rounded-2xl border border-gray-200 bg-gray-100" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Store</label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  {stores.length ? (
                    stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} {store.city ? `• ${store.city}` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">No stores found</option>
                  )}
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                  placeholder={selectedStore ? `Add top item for ${selectedStore.name}` : "Add top item"}
                  className="h-11 flex-1 rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                />
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {topItems.length ? (
                  topItems.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeItem(item)}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:text-gray-700"
                        aria-label={`Remove ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No top items yet.</div>
                )}
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              ) : null}
              {ok ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
