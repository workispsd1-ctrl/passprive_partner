"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { finalizePublicMenuPayment } from "@/lib/publicMenuPayments";

const MAX_AUTO_RETRIES = 5;
const RETRY_INTERVAL_MS = 3500;

function getStored(key) {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(key) || "");
}

export default function PublicMenuPaymentReturnPage() {
  const searchParams = useSearchParams();
  const outcome = String(searchParams.get("outcome") || "").toLowerCase();
  const querySessionId = String(searchParams.get("session_id") || "");

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [status, setStatus] = useState("");
  const [paymentSessionId, setPaymentSessionId] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [attempts, setAttempts] = useState(0);
  const oneShotRef = useRef(false);

  const doFinalize = async ({ autoRetry = false } = {}) => {
    if (oneShotRef.current) return;
    oneShotRef.current = true;
    setFinalizeError("");
    setIsFinalizing(true);

    try {
      const storedSessionId = getStored("public_menu_payment_session_id");
      const storedTrackingId = getStored("public_menu_tracking_id");
      const payload = querySessionId || storedSessionId
        ? { payment_session_id: querySessionId || storedSessionId }
        : { tracking_id: storedTrackingId };

      const data = await finalizePublicMenuPayment(payload);
      const nextStatus = String(data?.status || "").toUpperCase();
      setStatus(nextStatus);
      setPaymentSessionId(String(data?.payment_session_id || querySessionId || storedSessionId || ""));
      setTrackingId(String(data?.tracking_id || storedTrackingId || ""));
      setBookingId(String(data?.table_booking_id || ""));

      if (nextStatus === "FINALIZED") return;

      if (autoRetry && attempts < MAX_AUTO_RETRIES) {
        setAttempts((n) => n + 1);
        setTimeout(() => {
          oneShotRef.current = false;
          doFinalize({ autoRetry: true });
        }, RETRY_INTERVAL_MS);
      }
    } catch (e) {
      setFinalizeError(e?.message || "Unable to verify payment yet.");
      if (autoRetry && attempts < MAX_AUTO_RETRIES) {
        setAttempts((n) => n + 1);
        setTimeout(() => {
          oneShotRef.current = false;
          doFinalize({ autoRetry: true });
        }, RETRY_INTERVAL_MS);
      }
    } finally {
      setIsFinalizing(false);
      oneShotRef.current = false;
    }
  };

  useEffect(() => {
    const shouldAutoRetry = !["failed", "fail", "error"].includes(outcome);
    doFinalize({ autoRetry: shouldAutoRetry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSuccess = status === "FINALIZED";
  const showRetry = !isSuccess;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Payment Status</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isSuccess
            ? "Payment confirmed and booking created."
            : isFinalizing
            ? "Verifying your payment..."
            : "Payment is not finalized yet."}
        </p>

        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <p>Status: {status || "PENDING"}</p>
          <p>Tracking ID: {trackingId || "—"}</p>
          <p>Booking ID: {bookingId || "—"}</p>
          <p>Session ID: {paymentSessionId || "—"}</p>
        </div>

        {finalizeError ? <p className="mt-3 text-sm text-rose-600">{finalizeError}</p> : null}

        <div className="mt-4 flex items-center gap-2">
          {showRetry ? (
            <button
              type="button"
              onClick={() => doFinalize({ autoRetry: false })}
              disabled={isFinalizing}
              className="rounded-lg bg-[#DA3224] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isFinalizing ? "Finalizing..." : "Retry Finalize"}
            </button>
          ) : null}
          <Link
            href={`/public-menu?id=${encodeURIComponent(getStored("public_menu_restaurant_id"))}&table=${encodeURIComponent(getStored("public_menu_table_no"))}`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Back to Menu
          </Link>
        </div>
      </div>
    </div>
  );
}

