"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchMyStores } from "@/lib/store-partner/stores";

const ACTIVE_STORE_KEY = "store_partner_selected_store_id";

const DAYS = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

function emptyRow(storeId, dayOfWeek) {
  return {
    id: null,
    store_id: storeId,
    day_of_week: dayOfWeek,
    open_time: "",
    close_time: "",
    is_closed: false,
  };
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function mapByDay(rows) {
  return new Map((rows || []).map((row) => [Number(row.day_of_week), row]));
}

function normalizeRowForCompare(row) {
  return {
    id: row?.id ? String(row.id) : "",
    day_of_week: Number(row?.day_of_week ?? -1),
    open_time: normalizeTime(row?.open_time),
    close_time: normalizeTime(row?.close_time),
    is_closed: Boolean(row?.is_closed),
  };
}

function rowHasChanges(current, original) {
  const currentRow = normalizeRowForCompare(current);
  const originalRow = normalizeRowForCompare(original);

  return (
    currentRow.id !== originalRow.id ||
    currentRow.day_of_week !== originalRow.day_of_week ||
    currentRow.open_time !== originalRow.open_time ||
    currentRow.close_time !== originalRow.close_time ||
    currentRow.is_closed !== originalRow.is_closed
  );
}

function readStoredStoreId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACTIVE_STORE_KEY) || "";
}

function persistStoreId(id) {
  if (typeof window === "undefined" || !id) return;
  window.localStorage.setItem(ACTIVE_STORE_KEY, String(id));
  window.dispatchEvent(new Event("store-selection-changed"));
}

export default function StoreTimingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState(null);
  const [error, setError] = useState("");
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [rows, setRows] = useState([]);
  const [originalRows, setOriginalRows] = useState([]);

  const originalByDay = useMemo(() => mapByDay(originalRows), [originalRows]);
  const visibleRows = useMemo(
    () => [...rows].sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week)),
    [rows]
  );
  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === String(selectedStoreId)) || null,
    [stores, selectedStoreId]
  );

  const applyLoadedHours = (hours, storeId) => {
    const hoursByDay = mapByDay(
      (hours || []).map((row) => ({
        ...row,
        store_id: row.store_id || storeId,
        open_time: normalizeTime(row.open_time),
        close_time: normalizeTime(row.close_time),
      }))
    );

    const nextRows = DAYS.map((day) => {
      const existing = hoursByDay.get(day.value);
      return existing ? { ...existing } : emptyRow(storeId, day.value);
    });

    setRows(nextRows);
    setOriginalRows(nextRows.map((row) => ({ ...row })));
  };

  const loadHours = useCallback(async (storeId) => {
    if (!storeId) {
      setRows([]);
      setOriginalRows([]);
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("store_opening_hours")
      .select("id, store_id, day_of_week, open_time, close_time, is_closed")
      .eq("store_id", storeId)
      .order("day_of_week", { ascending: true });

    if (error) throw error;
    applyLoadedHours(data || [], storeId);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const {
          data: { user },
        } = await supabaseBrowser.auth.getUser();

        if (!user?.id) {
          if (mounted) {
            setError("You must be signed in to manage store timings.");
            setLoading(false);
          }
          return;
        }

        const accessibleStores = (await fetchMyStores()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!mounted) return;

        setStores(accessibleStores);

        const preferredId = readStoredStoreId();
        const firstValidId =
          accessibleStores.find((store) => String(store.id) === String(preferredId))?.id ||
          accessibleStores[0]?.id ||
          "";

        setSelectedStoreId(String(firstValidId || ""));

        if (firstValidId) {
          await loadHours(firstValidId);
        } else {
          setRows([]);
          setOriginalRows([]);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load store timings.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [loadHours]);

  const handleStoreChange = async (value) => {
    setSelectedStoreId(value);
    persistStoreId(value);
    setLoading(true);
    setError("");
    try {
      await loadHours(value);
    } catch (e) {
      setError(e?.message || "Failed to load store timings.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (dayOfWeek, patch) => {
    setRows((prev) =>
      prev.map((row) =>
        Number(row.day_of_week) === Number(dayOfWeek) ? { ...row, ...patch } : row
      )
    );
  };

  const resetRow = (dayOfWeek) => {
    const original = originalByDay.get(Number(dayOfWeek));
    setRows((prev) =>
      prev.map((row) =>
        Number(row.day_of_week) === Number(dayOfWeek)
          ? { ...(original || emptyRow(selectedStoreId, dayOfWeek)) }
          : row
      )
    );
  };

  const saveRow = async (row) => {
    if (!selectedStoreId) return;
    if (!row.is_closed && (!row.open_time || !row.close_time)) {
      toast.error("Please choose both opening and closing time, or mark the day as closed.");
      return;
    }
    if (!row.is_closed && row.open_time === row.close_time) {
      toast.error("Opening and closing time cannot be the same.");
      return;
    }

    setSavingDay(row.day_of_week);
    try {
      const payload = {
        id: row.id || undefined,
        ...row,
        store_id: selectedStoreId,
        day_of_week: Number(row.day_of_week),
        open_time: row.is_closed ? null : normalizeTime(row.open_time),
        close_time: row.is_closed ? null : normalizeTime(row.close_time),
        is_closed: Boolean(row.is_closed),
      };

      const { error } = await supabaseBrowser
        .from("store_opening_hours")
        .upsert(payload, { onConflict: "store_id,day_of_week" });

      if (error) throw error;

      await loadHours(selectedStoreId);
      toast.success(
        `${DAYS.find((day) => day.value === Number(row.day_of_week))?.label || "Day"} timings saved.`
      );
    } catch (e) {
      toast.error(e?.message || "Could not save store timings.");
    } finally {
      setSavingDay(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#771FA8]/15 bg-[#F4E7D1] px-3 py-1 text-xs font-semibold text-[#771FA8]">
              <Clock3 className="h-3.5 w-3.5" />
              Store Timings
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Opening Hours</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage store opening and closing hours for each day. Mark any day as closed if needed.
            </p>
          </div>

          <div className="w-full max-w-[280px]">
            <select
              value={selectedStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              {stores.length ? null : <option value="">No stores found</option>}
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Weekly Schedule{selectedStore?.name ? ` for ${selectedStore.name}` : ""}
          </h3>
        </div>

        <div className="divide-y divide-slate-200">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid gap-4 px-6 py-5 md:grid-cols-[180px_1fr_auto]">
                <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="h-11 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-11 animate-pulse rounded-xl bg-slate-200" />
                </div>
                <div className="h-11 w-48 animate-pulse rounded-xl bg-slate-200" />
              </div>
            ))
          ) : !selectedStoreId ? (
            <div className="px-6 py-10 text-sm text-slate-500">Select a store to manage timings.</div>
          ) : (
            visibleRows.map((row) => {
              const original =
                originalByDay.get(Number(row.day_of_week)) || emptyRow(selectedStoreId, row.day_of_week);
              const dayName = DAYS.find((day) => day.value === Number(row.day_of_week))?.label || "Day";
              const dirty = rowHasChanges(row, original);
              const busy = savingDay === row.day_of_week;

              return (
                <div key={row.day_of_week} className="grid gap-4 px-6 py-5 lg:grid-cols-[180px_1fr_auto] lg:items-center">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{dayName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.is_closed
                        ? "Marked as closed"
                        : row.open_time && row.close_time
                          ? `${normalizeTime(row.open_time)} - ${normalizeTime(row.close_time)}`
                          : "Set opening and closing time"}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[140px_140px_auto] md:items-center">
                    <input
                      type="time"
                      step="60"
                      value={row.is_closed ? "" : row.open_time || ""}
                      disabled={row.is_closed || busy}
                      onChange={(e) => updateRow(row.day_of_week, { open_time: e.target.value })}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />

                    <input
                      type="time"
                      step="60"
                      value={row.is_closed ? "" : row.close_time || ""}
                      disabled={row.is_closed || busy}
                      onChange={(e) => updateRow(row.day_of_week, { close_time: e.target.value })}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />

                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(row.is_closed)}
                        disabled={busy}
                        onChange={(e) =>
                          updateRow(row.day_of_week, {
                            is_closed: e.target.checked,
                            open_time: e.target.checked ? "" : row.open_time,
                            close_time: e.target.checked ? "" : row.close_time,
                          })
                        }
                      />
                      Closed all day
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => resetRow(row.day_of_week)}
                      disabled={busy || !dirty}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={() => saveRow(row)}
                      disabled={busy || !dirty}
                      className="rounded-xl bg-[#771FA8] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#771FA8]/35 disabled:text-white/80"
                    >
                      {savingDay === row.day_of_week ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
