"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function CashierBookingsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/bookings", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load bookings.");
      setRows(json.bookings || []);
    } catch (e) {
      setError(e?.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900">Bookings</div>
      {error ? <div className="px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {loading ? (
        <div className="px-4 py-6 text-sm text-slate-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">No bookings yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Guests</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2">{b.customer_name || "Guest"}</td>
                <td className="px-3 py-2">{b.customer_phone || "—"}</td>
                <td className="px-3 py-2">{b.booking_date || "—"}</td>
                <td className="px-3 py-2">{String(b.booking_time || "").slice(0, 5) || "—"}</td>
                <td className="px-3 py-2">{b.party_size || 1}</td>
                <td className="px-3 py-2">{String(b.status || "").toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
