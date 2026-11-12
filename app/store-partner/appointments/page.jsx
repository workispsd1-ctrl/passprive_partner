"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import AppointmentActions, {
  APPOINTMENT_SELECT,
  appointmentStatus,
  servicesLabel,
  slotLabel,
} from "@/components/store-dashboard/AppointmentActions";

export default function AppointmentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error: qError } = await supabaseBrowser
      .from("store_orders")
      .select(APPOINTMENT_SELECT)
      .eq("service_type", "APPOINTMENT")
      .gte("slot_start_at", since)
      .order("slot_start_at", { ascending: true })
      .limit(200);
    setLoading(false);
    if (qError) {
      setError(qError.message);
      return;
    }
    setError("");
    setRows(data || []);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Accept or reject new appointments, or ask for a cover charge. Every guest prepays at least MUR 20, which comes off their bill.
        </p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-gray-500">No upcoming appointments.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const [label, tone] = appointmentStatus(a);
            return (
              <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {slotLabel(a.slot_start_at)} · {a.customer_name || "Guest"}
                    </p>
                    <p className="text-sm text-gray-700">{servicesLabel(a.items)}</p>
                    <p className="text-xs text-gray-500">
                      {a.stores?.name || ""} · {a.customer_phone || "—"} · Code {a.order_no || "—"} · Prepaid MUR {Number(a.cover_charge_amount || 0)}
                      {a.cover_request_status === "requested" ? ` · Cover MUR ${Number(a.cover_request_total || 0)} requested` : ""}
                      {a.cancel_reason ? ` · ${a.cancel_reason}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
                </div>
                <div className="mt-3 max-w-md">
                  <AppointmentActions appointment={a} onDone={load} compact />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
