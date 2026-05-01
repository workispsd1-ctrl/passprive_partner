"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Clock3 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

function toDateTime(dateStr, timeStr) {
  const d = String(dateStr || "");
  const t = String(timeStr || "").slice(0, 5);
  if (!d || !t) return null;
  const dt = new Date(`${d}T${t}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function minutesDiff(target) {
  if (!target) return null;
  return Math.floor((target.getTime() - Date.now()) / 60000);
}

function prettyCountdown(mins) {
  if (mins == null) return "—";
  if (mins < 0) return "Started";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtDateLabel(dateStr) {
  const d = new Date(`${String(dateStr || "")}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr || "—");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtTime12(timeStr) {
  const raw = String(timeStr || "").slice(0, 5);
  const [hh, mm] = raw.split(":").map((x) => Number(x));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return raw || "—";
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function bookingStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "confirmed" || s === "payment_successfull") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "pending") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "completed") return "bg-indigo-100 text-indigo-800 border-indigo-200";
  if (s === "cancelled" || s === "no_show") return "bg-rose-100 text-rose-800 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function CashierBookingsPage() {
  const pulseStorageKey = "cashier_bookings_seen_signature";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedTableNo, setSelectedTableNo] = useState(null);
  const [savingStatusId, setSavingStatusId] = useState("");
  const [drawerCompletedDate, setDrawerCompletedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pulsingTables, setPulsingTables] = useState({});
  const [, setTick] = useState(0);
  const [lastSnapshot, setLastSnapshot] = useState("");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/cashier/bookings", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load bookings.");
      const nextBookings = Array.isArray(json?.bookings) ? json.bookings : [];
      const nextTables = Array.isArray(json?.tables) ? json.tables : [];
      const nextSnapshot = JSON.stringify({
        bookings: nextBookings.map((b) => [b.id, b.status, b.updated_at, b.notes_internal, b.matched_table_no]),
        tables: nextTables.map((t) => [t.id, t.table_no, t.capacity, t.pos_x, t.pos_y]),
      });
      if (silent && nextSnapshot === lastSnapshot) return;
      setBookings(nextBookings);
      setTables(nextTables);
      setLastSnapshot(nextSnapshot);
    } catch (e) {
      setError(e?.message || "Failed to load bookings.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load({ silent: true });
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const tableNos = useMemo(() => {
    const base = (tables || []).map((t) => Number(t.table_no || 0)).filter((n) => Number.isInteger(n) && n > 0);
    if (base.length) return base.sort((a, b) => a - b);
    return Array.from({ length: 12 }).map((_, i) => i + 1);
  }, [tables]);

  const enrichedBookings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const activeStatuses = new Set(["pending", "confirmed", "payment_successfull"]);
    return bookings.map((b) => {
      const dt = toDateTime(b.booking_date, b.booking_time);
      const mins = minutesDiff(dt);
      return {
        ...b,
        timeObj: dt,
        mins,
        isUpcomingToday: String(b.booking_date || "") === today && mins != null && mins >= 0 && activeStatuses.has(String(b.status || "").toLowerCase()),
      };
    });
  }, [bookings]);

  const activeBookings = useMemo(() => {
    const activeSet = new Set(["pending", "confirmed", "payment_successfull"]);
    return enrichedBookings.filter((b) => activeSet.has(String(b.status || "").toLowerCase()));
  }, [enrichedBookings]);

  const mappedByTable = useMemo(() => {
    const map = new Map();
    const used = new Set();

    for (const b of activeBookings) {
      const t = Number(b.matched_table_no || 0);
      if (Number.isInteger(t) && t > 0) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push(b);
        used.add(b.id);
      }
    }

    const remaining = activeBookings
      .filter((b) => !used.has(b.id))
      .sort((a, z) => (a.timeObj?.getTime() || 0) - (z.timeObj?.getTime() || 0));

    let cursor = 0;
    for (const b of remaining) {
      const t = tableNos[cursor % tableNos.length];
      if (!map.has(t)) map.set(t, []);
      map.get(t).push({ ...b, tentative_table_no: t });
      cursor += 1;
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, z) => (a.timeObj?.getTime() || 0) - (z.timeObj?.getTime() || 0));
      map.set(k, arr);
    }

    return map;
  }, [activeBookings, tableNos]);

  useEffect(() => {
    let seenSignature = {};
    try {
      const raw = window.localStorage.getItem(pulseStorageKey);
      seenSignature = raw ? JSON.parse(raw) : {};
    } catch {
      seenSignature = {};
    }

    const nextPulse = {};
    for (const tableNo of tableNos) {
      const activeRows = mappedByTable.get(tableNo) || [];
      if (!activeRows.length) continue;
      const signature = activeRows
        .map((b) => `${b.id}:${b.updated_at || b.created_at || ""}:${b.status || ""}`)
        .sort()
        .join("|");
      const key = String(tableNo);
      const lastSeen = String(seenSignature[key] || "");
      nextPulse[key] = signature !== lastSeen;
    }
    setPulsingTables(nextPulse);
  }, [mappedByTable, tableNos]);

  const mappedAllByTable = useMemo(() => {
    const map = new Map();
    for (const b of enrichedBookings) {
      const t = Number(b.matched_table_no || 0);
      if (!Number.isInteger(t) || t <= 0) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(b);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, z) => (z.timeObj?.getTime() || 0) - (a.timeObj?.getTime() || 0));
      map.set(k, arr);
    }
    return map;
  }, [enrichedBookings]);

  const selectedBookings = useMemo(() => {
    if (!selectedTableNo) return [];
    return mappedAllByTable.get(Number(selectedTableNo)) || [];
  }, [mappedAllByTable, selectedTableNo]);

  const selectedActiveBookings = useMemo(() => {
    const activeSet = new Set(["pending", "confirmed", "payment_successfull"]);
    return selectedBookings.filter((b) => activeSet.has(String(b.status || "").toLowerCase()));
  }, [selectedBookings]);

  const selectedCompletedBookings = useMemo(() => {
    return selectedBookings.filter(
      (b) =>
        String(b.status || "").toLowerCase() === "completed" &&
        String(b.booking_date || "") === String(drawerCompletedDate || "")
    );
  }, [selectedBookings, drawerCompletedDate]);

  const updateStatus = async (id, status) => {
    setSavingStatusId(id);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/cashier/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update booking status.");
      toast.success("Booking status updated.");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to update booking status.");
    } finally {
      setSavingStatusId("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-xl">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {tableNos.map((tableNo) => {
            const tableBookings = mappedByTable.get(tableNo) || [];
            const nextUpcoming = tableBookings.find((b) => b.isUpcomingToday);
            const hasAny = tableBookings.length > 0;
            const primaryBooking = tableBookings[0] || null;
            const primaryDate = primaryBooking ? String(primaryBooking.booking_date || "") : "";
            const primaryTime = primaryBooking ? String(primaryBooking.booking_time || "").slice(0, 5) : "";
            const mins = Number(primaryBooking?.mins);
            const showRunning = Number.isFinite(mins) && mins <= 120 && mins >= 0;
            return (
              <button
                key={tableNo}
                type="button"
                onClick={() => {
                  setSelectedTableNo(tableNo);
                  const activeRows = mappedByTable.get(tableNo) || [];
                  const signature = activeRows
                    .map((b) => `${b.id}:${b.updated_at || b.created_at || ""}:${b.status || ""}`)
                    .sort()
                    .join("|");
                  try {
                    const raw = window.localStorage.getItem(pulseStorageKey);
                    const seenSignature = raw ? JSON.parse(raw) : {};
                    seenSignature[String(tableNo)] = signature;
                    window.localStorage.setItem(pulseStorageKey, JSON.stringify(seenSignature));
                  } catch {}
                  setPulsingTables((prev) => ({ ...prev, [String(tableNo)]: false }));
                }}
                className={`rounded-xl border p-4 text-left transition ${
                  hasAny ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100" : "border-slate-200 bg-white hover:bg-slate-50"
                } ${pulsingTables[String(tableNo)] ? "table-zoom-alert" : ""}`}
                style={{ minHeight: 150 }}
              >
                <div className="text-lg font-bold text-slate-900">Table T{tableNo}</div>
                <div className="mt-1 text-sm text-slate-600">{hasAny ? `${tableBookings.length} booking(s)` : "No bookings"}</div>
                <div className="mt-4 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                  <Clock3 className="h-4 w-4" />
                  {hasAny
                    ? `${fmtDateLabel(primaryDate)} ${fmtTime12(primaryTime)}`
                    : "No booking slot"}
                </div>
                {showRunning ? (
                  <div className="mt-2 inline-flex items-center rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                    Starts in {prettyCountdown(mins)}
                  </div>
                ) : null}
                {!showRunning && nextUpcoming ? (
                  <div className="mt-2 text-[11px] font-medium text-slate-600">
                    Countdown begins 2h before slot
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedTableNo ? (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/25 pointer-events-auto" onClick={() => setSelectedTableNo(null)} />
          <div className="absolute right-0 top-0 h-full w-full lg:w-[calc(100%-16rem)] bg-white border-l border-slate-200 shadow-2xl pointer-events-auto overflow-auto">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Table T{selectedTableNo} Bookings</h3>
                <p className="text-xs text-slate-500">View and update booking statuses</p>
              </div>
              <button onClick={() => setSelectedTableNo(null)} className="h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">Active bookings</div>
                <div className="mt-2 space-y-3">
                  {selectedActiveBookings.length === 0 ? (
                    <div className="text-xs text-slate-500">No active bookings on this table.</div>
                  ) : (
                    selectedActiveBookings.map((b) => (
                      <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{b.customer_name || "Guest"}</div>
                            <div className="text-xs text-slate-600">{b.customer_phone || "—"}</div>
                          </div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${bookingStatusClass(b.status)}`}>
                            {String(b.status || "pending").toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
                          <div>Date: {String(b.booking_date || "—")}</div>
                          <div>Time: {fmtTime12(b.booking_time)}</div>
                          <div>Guests: {Number(b.party_size || 1)}</div>
                          <div>Slot: {b.booked_slot_label || "—"}</div>
                          <div>Cover Charge: {Number(b.cover_charge_amount || 0) > 0 ? `MUR ${Number(b.cover_charge_amount || 0).toFixed(2)}` : "MUR 0.00"}</div>
                          <div>Payment: {String(b.payment_status || "pending").toUpperCase()}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[ "confirmed", "payment_successfull", "cancelled", "no_show"].map((st) => {
                            const active = String(b.status || "").toLowerCase() === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={active || savingStatusId === b.id}
                                onClick={() => updateStatus(b.id, st)}
                                className={`h-8 rounded-lg px-2.5 text-xs font-semibold border text-white ${
                                  active
                                    ? "border-slate-400 bg-slate-400"
                                    : st === "pending"
                                    ? "border-amber-700 bg-amber-600 hover:bg-amber-700"
                                    : st === "confirmed"
                                    ? "border-sky-700 bg-sky-600 hover:bg-sky-700"
                                    : st === "payment_successfull"
                                    ? "border-emerald-700 bg-emerald-600 hover:bg-emerald-700"
                                    : st === "completed"
                                    ? "border-indigo-700 bg-indigo-600 hover:bg-indigo-700"
                                    : st === "cancelled"
                                    ? "border-rose-700 bg-rose-600 hover:bg-rose-700"
                                    : "border-slate-700 bg-slate-600 hover:bg-slate-700"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {st.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-end justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Completed bookings/orders</div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mr-2">Date :</label>
                    <input
                      type="date"
                      value={drawerCompletedDate}
                      onChange={(e) => setDrawerCompletedDate(e.target.value)}
                      className="mt-1 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                    />
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {selectedCompletedBookings.length === 0 ? (
                    <div className="text-xs text-slate-500">No completed entries for selected date on this table.</div>
                  ) : (
                    <>
                      {selectedCompletedBookings.map((b) => (
                        <div key={`cb-${b.id}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs font-semibold text-slate-900">{b.customer_name || "Guest"} • {fmtTime12(b.booking_time)}</div>
                          <div className="text-xs text-slate-600">{b.customer_phone || "—"} • Guests {Number(b.party_size || 1)} • Booking</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .table-zoom-alert {
          animation: tableZoomAlert 1.1s ease-in-out infinite;
          transform-origin: center;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45);
        }
        @keyframes tableZoomAlert {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45);
          }
          50% {
            transform: scale(1.045);
            box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.12);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45);
          }
        }
      `}</style>
    </div>
  );
}
