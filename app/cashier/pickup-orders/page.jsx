"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(num);
}

export default function CashierPickupOrdersPage() {
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

      const res = await fetch("/api/cashier/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load pickup orders.");
      setRows(Array.isArray(json?.rows?.pickup_orders) ? json.rows.pickup_orders : []);
    } catch (e) {
      setError(e?.message || "Failed to load pickup orders.");
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
      <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900">Pickup Orders</div>
      {error ? <div className="px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {loading ? (
        <div className="px-4 py-6 text-sm text-slate-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">No pickup orders yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Payment</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2">{o.order_number || `#${String(o.id).slice(0, 8)}`}</td>
                <td className="px-3 py-2">{o.customer_name || "Guest"}</td>
                <td className="px-3 py-2">{money(o.total_amount)}</td>
                <td className="px-3 py-2">{String(o.payment_status || "PENDING")}</td>
                <td className="px-3 py-2">{String(o.order_status || "NEW")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
