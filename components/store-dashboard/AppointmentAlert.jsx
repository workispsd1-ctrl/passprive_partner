"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import AppointmentActions, { APPOINTMENT_SELECT, servicesLabel, slotLabel } from "./AppointmentActions";

export default function AppointmentAlert() {
  const [queue, setQueue] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from("store_orders")
      .select(APPOINTMENT_SELECT)
      .eq("service_type", "APPOINTMENT")
      .in("status", ["NEW", "PLACED"])
      .is("partner_seen_at", null)
      .gte("slot_start_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);
    if (!error) setQueue((data || []).filter((a) => a.cover_request_status !== "requested"));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const active = queue[0];
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
          <h3 className="text-lg font-semibold text-amber-900">
            {String(active.status).toUpperCase() === "NEW" ? "New appointment request" : "New appointment"}
          </h3>
          <p className="text-xs text-amber-800">
            {active.stores?.name || "Your store"}
            {queue.length > 1 ? ` · ${queue.length - 1} more waiting` : ""}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 px-5 py-4 text-sm text-gray-700 sm:grid-cols-2">
          <div><span className="font-medium text-gray-900">Guest:</span> {active.customer_name || "—"}</div>
          <div><span className="font-medium text-gray-900">Phone:</span> {active.customer_phone || "—"}</div>
          <div><span className="font-medium text-gray-900">When:</span> {slotLabel(active.slot_start_at)}</div>
          <div><span className="font-medium text-gray-900">Code:</span> {active.order_no || "—"}</div>
          <div className="sm:col-span-2"><span className="font-medium text-gray-900">Services:</span> {servicesLabel(active.items)}</div>
          {active.notes ? <div className="sm:col-span-2"><span className="font-medium text-gray-900">Note:</span> {active.notes}</div> : null}
          {Number(active.cover_charge_amount) > 0 ? (
            <div className="sm:col-span-2 text-xs text-gray-500">Guest prepaid MUR {Number(active.cover_charge_amount)} · comes off their bill</div>
          ) : null}
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <AppointmentActions appointment={active} onDone={load} />
        </div>
      </div>
    </div>
  );
}
