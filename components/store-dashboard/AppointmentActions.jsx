"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export const APPOINTMENT_SELECT =
  "id, store_id, order_no, customer_name, customer_phone, customer_email, notes, items, status, payment_status, partner_seen_at, slot_start_at, created_at, cover_charge_amount, cover_request_status, cover_request_total, cover_request_due_at, cancel_reason, proposed_date, proposed_time, proposed_at, proposed_cover_amount, stores(name)";

const ERRORS = {
  amount_too_low: "The cover charge must be more than what the guest already paid.",
  invalid_amount: "Enter a valid cover charge amount.",
  cover_request_pending: "The guest has not paid the cover charge yet.",
  slot_passed: "This appointment time has already passed.",
  already_handled: "This appointment was already handled.",
  not_found: "This appointment could not be found.",
  forbidden: "You can't manage this store.",
  invalid_time: "Pick a future date and time that differs from the current slot.",
};

export function slotLabel(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: "Indian/Mauritius",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function proposedLabel(a) {
  if (!a?.proposed_at || !a?.proposed_date || !a?.proposed_time) return null;
  return slotLabel(`${a.proposed_date}T${String(a.proposed_time).slice(0, 5)}:00+04:00`);
}

export function guestConfirmedInfo(a) {
  if (String(a?.status || "").toUpperCase() !== "PLACED") return null;
  const paid = a?.cover_request_status === "paid";
  const acceptedTime = !a?.proposed_at && !!a?.proposed_date;
  if (!paid && !acceptedTime) return null;
  return {
    paid: paid ? Number(a.cover_request_total || a.cover_charge_amount || 0) : 0,
    acceptedTime: acceptedTime ? slotLabel(a.slot_start_at) : null,
  };
}

export function servicesLabel(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => it?.title || it?.name).filter(Boolean).join(", ") || "—";
}

export function appointmentStatus(a) {
  const s = String(a?.status || "").toUpperCase();
  if (a?.cover_request_status === "requested" && s !== "CANCELLED" && s !== "REJECTED") return ["Awaiting cover charge", "text-orange-700 bg-orange-50"];
  if (a?.proposed_at && (s === "NEW" || s === "PLACED")) return ["New time proposed", "text-orange-700 bg-orange-50"];
  if (s === "NEW") return ["New request", "text-amber-800 bg-amber-50"];
  if (s === "PLACED") return a?.partner_seen_at ? ["Confirmed", "text-green-700 bg-green-50"] : ["New", "text-amber-800 bg-amber-50"];
  if (s === "REJECTED") return ["Rejected", "text-red-700 bg-red-50"];
  if (s === "CANCELLED") return ["Cancelled", "text-red-700 bg-red-50"];
  if (s === "DELIVERED") return ["Completed", "text-blue-700 bg-blue-50"];
  return [s || "—", "text-gray-700 bg-gray-100"];
}

export default function AppointmentActions({ appointment, onDone, compact = false }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("main");
  const [amount, setAmount] = useState("");
  const [pDate, setPDate] = useState("");
  const [pTime, setPTime] = useState("");

  const status = String(appointment?.status || "").toUpperCase();
  const open = ["NEW", "PLACED"].includes(status);
  const unseen = open && !appointment?.partner_seen_at;
  const coverOpen = appointment?.cover_request_status === "requested";
  const coverDone = appointment?.cover_request_status === "paid";
  const minCover = Math.max(Number(appointment?.cover_charge_amount || 0), 20);

  const respond = async (action, extra = {}) => {
    setBusy(action);
    setError("");
    const { data, error: rpcError } = await supabaseBrowser.rpc("partner_respond_appointment", {
      p_order_id: appointment.id,
      p_action: action,
      ...extra,
    });
    setBusy("");
    if (rpcError || !data?.ok) {
      if (data?.error === "already_handled") return onDone?.();
      setError(ERRORS[data?.error] || rpcError?.message || "Could not update this appointment.");
      return;
    }
    setMode("main");
    onDone?.();
  };

  if (!open) return null;

  if (unseen && guestConfirmedInfo(appointment)) {
    return (
      <div className="space-y-2">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={!!busy}
          className="h-10 w-full rounded-xl bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : "OK"}
        </button>
      </div>
    );
  }

  const openPropose = () => {
    const start = appointment?.slot_start_at ? new Date(appointment.slot_start_at) : null;
    const local = start && !Number.isNaN(start.getTime())
      ? new Date(start.getTime() + 4 * 3600 * 1000).toISOString()
      : "";
    setPDate(local.slice(0, 10));
    setPTime(local.slice(11, 16));
    setAmount("");
    setError("");
    setMode("propose");
  };

  if (mode === "propose") {
    return (
      <div className="space-y-2">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-gray-700">
            New date
            <input
              type="date"
              value={pDate}
              onChange={(e) => setPDate(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs font-medium text-gray-700">
            New time
            <input
              type="time"
              value={pTime}
              onChange={(e) => setPTime(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            />
          </label>
        </div>
        <label className="block text-xs font-medium text-gray-700">
          Cover charge (optional, MUR). The guest pays it after accepting the new time.
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("main")} disabled={!!busy} className="h-10 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 disabled:opacity-60">
            Back
          </button>
          <button
            type="button"
            onClick={() => respond("propose", { p_proposed_date: pDate, p_proposed_time: pTime.slice(0, 5), p_cover_amount: Number(amount) || null })}
            disabled={!!busy || !pDate || !pTime}
            className="h-10 flex-1 rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send to guest"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "cover") {
    return (
      <div className="space-y-2">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block text-xs font-medium text-gray-700">
          Cover charge for this appointment (MUR)
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-gray-700">
            New date (optional)
            <input
              type="date"
              value={pDate}
              onChange={(e) => setPDate(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs font-medium text-gray-700">
            New time (optional)
            <input
              type="time"
              value={pTime}
              onChange={(e) => setPTime(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            />
          </label>
        </div>
        <p className="text-xs text-gray-600">Leave the time empty to keep the booked slot.</p>
        <p className="text-xs text-gray-600">
          Minimum MUR 20. Anything the guest already prepaid counts towards it; they pay the rest within 2 hours and it comes off their bill.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("main")} disabled={!!busy} className="h-10 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 disabled:opacity-60">
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (!pTime) return respond("request_cover", { p_cover_amount: Number(amount) });
              const start = appointment?.slot_start_at ? new Date(new Date(appointment.slot_start_at).getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10) : "";
              return respond("propose", { p_proposed_date: pDate || start, p_proposed_time: pTime.slice(0, 5), p_cover_amount: Number(amount) });
            }}
            disabled={!!busy || !Number(amount)}
            className="h-10 flex-1 rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {proposedLabel(appointment) ? (
        <p className="text-xs text-orange-700">
          Proposed: {proposedLabel(appointment)}
          {Number(appointment.proposed_cover_amount) > 0 ? ` · MUR ${Number(appointment.proposed_cover_amount).toLocaleString("en-US")} cover charge` : ""} · waiting for guest
        </p>
      ) : null}
      <div className={`flex gap-2 ${compact ? "flex-wrap" : ""}`}>
        <button
          type="button"
          onClick={() => respond("reject", { p_reason: "Rejected by store" })}
          disabled={!!busy}
          className="h-10 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        {unseen && !coverOpen ? (
          <button
            type="button"
            onClick={() => respond("accept")}
            disabled={!!busy}
            className="h-10 flex-1 rounded-xl bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {busy === "accept" ? "Accepting…" : status === "NEW" ? "Accept" : "OK"}
          </button>
        ) : null}
      </div>
      {unseen && !coverOpen ? (
        <button
          type="button"
          onClick={openPropose}
          disabled={!!busy}
          className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
        >
          Propose new timing
        </button>
      ) : null}
      {unseen && !coverOpen && !coverDone ? (
        <button
          type="button"
          onClick={() => { setError(""); setAmount(""); setPDate(""); setPTime(""); setMode("cover"); }}
          disabled={!!busy}
          className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
        >
          Request cover charge
        </button>
      ) : null}
    </div>
  );
}
