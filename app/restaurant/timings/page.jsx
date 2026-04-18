"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  fetchRestaurantOpeningHours,
  upsertRestaurantOpeningHour,
} from "@/lib/restaurantData";
import { showToast } from "@/components/restaurant-dashboard/useToast";

const DAYS = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

function emptyRow(restaurantId, dayOfWeek) {
  return {
    id: null,
    restaurant_id: restaurantId,
    day_of_week: dayOfWeek,
    open_time: "",
    close_time: "",
    is_closed: false,
  };
}

function mapByDay(rows) {
  return new Map((rows || []).map((row) => [Number(row.day_of_week), row]));
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
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

export default function RestaurantTimingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState(null);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [rows, setRows] = useState([]);
  const [originalRows, setOriginalRows] = useState([]);

  const originalByDay = useMemo(() => mapByDay(originalRows), [originalRows]);
  const visibleRows = useMemo(
    () => [...rows].sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week)),
    [rows]
  );

  const applyLoadedHours = (data) => {
    const existingRows = (data.hours || []).map((row) => ({
      ...row,
      restaurant_id: row.restaurant_id || data.restaurantId,
    }));
    setRestaurantId(data.restaurantId);
    setRows(existingRows);
    setOriginalRows(existingRows);
  };

  const reloadHours = async (userId) => {
    const data = await fetchRestaurantOpeningHours(supabaseBrowser, userId);
    applyLoadedHours(data);
    return data;
  };

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
            setLoading(false);
            setError("You must be signed in to manage restaurant timings.");
          }
          return;
        }

        setUserId(user.id);
        const data = await fetchRestaurantOpeningHours(supabaseBrowser, user.id);
        if (!mounted) return;
        applyLoadedHours(data);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load opening hours.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const updateRow = (dayOfWeek, patch) => {
    setRows((prev) =>
      prev.map((row) =>
        Number(row.day_of_week) === Number(dayOfWeek)
          ? { ...row, ...patch }
          : row
      )
    );
  };

  const resetRow = (dayOfWeek) => {
    const original = originalByDay.get(Number(dayOfWeek));
    setRows((prev) =>
      prev.map((row) =>
        Number(row.day_of_week) === Number(dayOfWeek)
          ? { ...(original || emptyRow(restaurantId, dayOfWeek)) }
          : row
      )
    );
  };

  const saveRow = async (row) => {
    if (!restaurantId) return;
    if (!row.is_closed && (!row.open_time || !row.close_time)) {
      showToast({
        type: "error",
        title: "Missing hours",
        description: "Please choose both opening and closing time, or mark the day as closed.",
      });
      return;
    }

    if (!row.is_closed && row.open_time === row.close_time) {
      showToast({
        type: "error",
        title: "Invalid hours",
        description: "Opening and closing time cannot be the same.",
      });
      return;
    }

    setSavingDay(row.day_of_week);
    try {
      await upsertRestaurantOpeningHour(supabaseBrowser, restaurantId, {
        ...row,
        open_time: normalizeTime(row.open_time),
        close_time: normalizeTime(row.close_time),
      });

      if (userId) {
        await reloadHours(userId);
      }

      showToast({
        type: "success",
        title: "Timings saved",
        description: `${DAYS.find((day) => day.value === Number(row.day_of_week))?.label || "Day"} hours updated.`,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Save failed",
        description: e?.message || "Could not save opening hours.",
      });
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
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Opening Hours</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage restaurant opening and closing hours for each day. Mark any day as closed if needed.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Weekly Schedule</h3>
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
                <div className="h-11 w-36 animate-pulse rounded-xl bg-slate-200" />
              </div>
            ))
          ) : visibleRows.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              No timings added yet. Use the selector above to add a day.
            </div>
          ) : (
            visibleRows.map((row) => {
              const original = originalByDay.get(Number(row.day_of_week)) || emptyRow(restaurantId, row.day_of_week);
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
                      value={row.is_closed ? "" : (row.open_time || "")}
                      disabled={row.is_closed || busy}
                      onChange={(e) => updateRow(row.day_of_week, { open_time: e.target.value })}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />

                    <input
                      type="time"
                      step="60"
                      value={row.is_closed ? "" : (row.close_time || "")}
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
