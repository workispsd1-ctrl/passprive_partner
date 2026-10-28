"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useI18n } from "@/lib/i18n";

const ESCALATION_DELAY_MS = 3 * 60 * 1000;

const RESPOND_ERRORS = ["payment_pending", "booking_paid", "invalid_time", "already_handled", "not_found"];

const BOOKING_SELECT_FIELDS = [
  "id",
  "restaurant_id",
  "customer_name",
  "customer_phone",
  "customer_email",
  "booking_date",
  "booking_time",
  "duration_minutes",
  "party_size",
  "status",
  "source",
  "special_request",
  "booking_code",
  "customer_booking_number",
  "created_at",
  "restaurants(booking_service_type)",
].join(",");

export default function BookingAlertNotifier() {
  const { t, fmt } = useI18n();
  const [activeBooking, setActiveBooking] = useState(null);
  const [queue, setQueue] = useState([]);
  const [visible, setVisible] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposeDate, setProposeDate] = useState("");
  const [proposeTime, setProposeTime] = useState("");
  const [respondError, setRespondError] = useState("");

  const channelRef = useRef(null);
  const pollRef = useRef(null);
  const audioRef = useRef(null);
  const escalationTimerRef = useRef(null);
  const activeBookingRef = useRef(null);
  const seenBookingIdsRef = useRef(new Set());
  const startedAtRef = useRef(new Date().toISOString());
  const audioUnlockedRef = useRef(false);
  const pendingPlayRef = useRef(false);

  useEffect(() => {
    activeBookingRef.current = activeBooking;
  }, [activeBooking]);

  useEffect(() => {
    const audio = new Audio("/sound.wav");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;

    const unlockAudio = async () => {
      if (!audioRef.current || audioUnlockedRef.current) return;
      try {
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioUnlockedRef.current = true;

        if (pendingPlayRef.current && activeBookingRef.current) {
          pendingPlayRef.current = false;
          playBuzzer();
        }
      } catch {
        // Keep listeners active until browser allows playback.
      }
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    };
  }, []);

  const stopBuzzer = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  };

  const playBuzzer = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioUnlockedRef.current) {
      pendingPlayRef.current = true;
      return;
    }
    try {
      audio.currentTime = 0;
      await audio.play();
      audioUnlockedRef.current = true;
    } catch {
      pendingPlayRef.current = true;
    }
  };

  const clearEscalationTimer = () => {
    if (escalationTimerRef.current) {
      window.clearTimeout(escalationTimerRef.current);
      escalationTimerRef.current = null;
    }
  };

  const startEscalationTimer = (booking) => {
    clearEscalationTimer();
    escalationTimerRef.current = window.setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        await fetch("/api/restaurant/bookings/escalate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data?.session?.access_token || ""}`,
          },
          body: JSON.stringify({ booking_id: booking?.id }),
        });
      } catch (error) {
        console.error("[BookingAlertNotifier] Escalation call failed:", error);
      }
    }, ESCALATION_DELAY_MS);
  };

  const showNextBooking = () => {
    setQueue((prev) => {
      if (!prev.length) {
        setActiveBooking(null);
        setVisible(false);
        stopBuzzer();
        clearEscalationTimer();
        return prev;
      }

      const [next, ...rest] = prev;
      setActiveBooking(next);
      setVisible(true);
      playBuzzer();
      startEscalationTimer(next);
      return rest;
    });
  };

  const isRequest =
    String(activeBooking?.status || "").toLowerCase() === "pending" ||
    String(activeBooking?.restaurants?.booking_service_type || "").toLowerCase() === "request";

  const silence = () => {
    pendingPlayRef.current = false;
    clearEscalationTimer();
    stopBuzzer();
  };

  const closeActive = () => {
    clearEscalationTimer();
    stopBuzzer();
    setAckLoading(false);
    setProposing(false);
    setRespondError("");
    setVisible(false);
    setActiveBooking(null);

    window.setTimeout(() => {
      showNextBooking();
    }, 120);
  };

  const acknowledgeBooking = async () => {
    if (!activeBooking?.id || ackLoading) return;
    silence();
    setAckLoading(true);
    await supabaseBrowser
      .from("restaurant_bookings")
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq("id", activeBooking.id);
    closeActive();
  };

  const respond = async (action, extra = {}) => {
    if (!activeBooking?.id || ackLoading) return;
    silence();
    setAckLoading(action);
    setRespondError("");
    const { data, error } = await supabaseBrowser.rpc("partner_respond_booking", {
      p_booking_id: activeBooking.id,
      p_action: action,
      ...extra,
    });
    if (error || !data?.ok) {
      setAckLoading(false);
      if (data?.error === "already_handled") return closeActive();
      setRespondError(
        RESPOND_ERRORS.includes(data?.error)
          ? t(`bookingAlert.err.${data.error}`)
          : error?.message || t("bookingAlert.err.generic"),
      );
      return;
    }
    closeActive();
  };

  const openPropose = () => {
    silence();
    setProposeDate(String(activeBooking?.booking_date || "").slice(0, 10));
    setProposeTime(String(activeBooking?.booking_time || "").slice(0, 5));
    setRespondError("");
    setProposing(true);
  };

  useEffect(() => {
    let active = true;

    const maybeQueueBooking = (booking) => {
      if (!booking?.id) return;
      const bookingId = String(booking.id);
      if (seenBookingIdsRef.current.has(bookingId)) return;
      seenBookingIdsRef.current.add(bookingId);

      setQueue((prev) => {
        const existsInQueue = prev.some((b) => String(b.id) === bookingId);
        if (existsInQueue) return prev;
        if (String(activeBookingRef.current?.id || "") === bookingId) return prev;
        return [...prev, booking];
      });
    };

    const pullRecentBookings = async () => {
      const { data } = await supabaseBrowser
        .from("restaurant_bookings")
        .select(BOOKING_SELECT_FIELDS)
        .gt("created_at", startedAtRef.current)
        .order("created_at", { ascending: true })
        .limit(20);

      (data || []).forEach(maybeQueueBooking);
    };

    const setup = async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user || !active) return;

      channelRef.current = supabaseBrowser
        .channel("restaurant-booking-buzzer-global")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "restaurant_bookings",
          },
          async (payload) => {
            const newId = payload?.new?.id;
            if (!newId) return;

            const { data: fullBooking } = await supabaseBrowser
              .from("restaurant_bookings")
              .select(BOOKING_SELECT_FIELDS)
              .eq("id", newId)
              .maybeSingle();

            // If current user cannot read this booking due to RLS, ignore it.
            if (!fullBooking) return;
            maybeQueueBooking(fullBooking);
          }
        )
        .subscribe();

      // Fallback polling path if realtime event is missed.
      await pullRecentBookings();
      pollRef.current = window.setInterval(pullRecentBookings, 5000);
    };

    setup();

    return () => {
      active = false;
      clearEscalationTimer();
      stopBuzzer();
      if (channelRef.current) {
        supabaseBrowser.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeBooking && queue.length) {
      showNextBooking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, activeBooking]);

  if (!visible || !activeBooking) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-amber-300 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-amber-900">
              {isRequest ? t("bookingAlert.titleRequest") : t("bookingAlert.title")}
            </h3>
            {isRequest && (
              <p className="mt-0.5 text-xs text-amber-800">{t("bookingAlert.requestHint")}</p>
            )}
            
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-white"
            aria-label={t("bookingAlert.active")}
            disabled
          >
            <X className="h-4 w-4 text-amber-700" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 text-sm text-gray-700 sm:grid-cols-2">
          <div><span className="font-medium text-gray-900">{t("bookingAlert.guest")}</span> {activeBooking.customer_name || "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.phone")}</span> {activeBooking.customer_phone || "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.email")}</span> {activeBooking.customer_email || "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.partySize")}</span> {activeBooking.party_size ?? "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.date")}</span> {activeBooking.booking_date ? fmt.dateLong(`${String(activeBooking.booking_date).slice(0, 10)}T12:00:00+04:00`) : "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.time")}</span> {activeBooking.booking_time ? fmt.slot(activeBooking.booking_time) : "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.receivedAt")}</span> {activeBooking.created_at ? fmt.dateTime(activeBooking.created_at) : "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.duration")}</span> {activeBooking.duration_minutes ? t("bookingAlert.minutes", { count: activeBooking.duration_minutes }) : "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.source")}</span> {activeBooking.source || "—"}</div>
          <div><span className="font-medium text-gray-900">{t("bookingAlert.code")}</span> {activeBooking.booking_code || activeBooking.customer_booking_number || "—"}</div>
          <div className="sm:col-span-2"><span className="font-medium text-gray-900">{t("bookingAlert.specialRequest")}</span> {activeBooking.special_request || "—"}</div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          {respondError && <p className="mb-3 text-sm text-red-600">{respondError}</p>}
          {!isRequest ? (
            <button
              type="button"
              onClick={acknowledgeBooking}
              disabled={!!ackLoading}
              className="h-10 w-full rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {ackLoading ? t("common.saving") : t("common.ok")}
            </button>
          ) : proposing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-700">
                  {t("bookingAlert.newDate")}
                  <input
                    type="date"
                    value={proposeDate}
                    onChange={(e) => setProposeDate(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  {t("bookingAlert.newTime")}
                  <input
                    type="time"
                    value={proposeTime}
                    onChange={(e) => setProposeTime(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProposing(false)}
                  disabled={!!ackLoading}
                  className="h-10 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t("common.back")}
                </button>
                <button
                  type="button"
                  onClick={() => respond("propose", { p_proposed_date: proposeDate, p_proposed_time: proposeTime.slice(0, 5) })}
                  disabled={!!ackLoading || !proposeDate || !proposeTime}
                  className="h-10 flex-1 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {ackLoading === "propose" ? t("bookingAlert.sending") : t("bookingAlert.sendToGuest")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => respond("reject", { p_reason: "Rejected by restaurant" })}
                disabled={!!ackLoading}
                className="h-10 flex-1 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {ackLoading === "reject" ? t("common.rejecting") : t("common.reject")}
              </button>
              <button
                type="button"
                onClick={openPropose}
                disabled={!!ackLoading}
                className="h-10 flex-1 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
              >
                {t("bookingAlert.propose")}
              </button>
              <button
                type="button"
                onClick={() => respond("accept")}
                disabled={!!ackLoading}
                className="h-10 flex-1 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {ackLoading === "accept" ? t("common.accepting") : t("common.accept")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
