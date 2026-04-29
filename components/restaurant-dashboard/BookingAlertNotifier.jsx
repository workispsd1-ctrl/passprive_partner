"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const ESCALATION_DELAY_MS = 3 * 60 * 1000;

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
].join(",");

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function BookingAlertNotifier() {
  const [activeBooking, setActiveBooking] = useState(null);
  const [queue, setQueue] = useState([]);
  const [visible, setVisible] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);

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
        await fetch("/api/restaurant/bookings/escalate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ booking }),
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

  const acknowledgeBooking = async () => {
    if (!activeBooking?.id || ackLoading) return;
    setAckLoading(true);

    clearEscalationTimer();
    stopBuzzer();

    await supabaseBrowser
      .from("restaurant_bookings")
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq("id", activeBooking.id);

    setAckLoading(false);
    setVisible(false);
    setActiveBooking(null);

    window.setTimeout(() => {
      showNextBooking();
    }, 120);
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
            <h3 className="text-base font-semibold text-amber-900">New Table Booking Alert</h3>
            
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-white"
            aria-label="Booking alert active"
            disabled
          >
            <X className="h-4 w-4 text-amber-700" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 text-sm text-gray-700 sm:grid-cols-2">
          <div><span className="font-medium text-gray-900">Guest:</span> {activeBooking.customer_name || "-"}</div>
          <div><span className="font-medium text-gray-900">Phone:</span> {activeBooking.customer_phone || "-"}</div>
          <div><span className="font-medium text-gray-900">Email:</span> {activeBooking.customer_email || "-"}</div>
          <div><span className="font-medium text-gray-900">Party Size:</span> {activeBooking.party_size ?? "-"}</div>
          <div><span className="font-medium text-gray-900">Date:</span> {formatDate(activeBooking.booking_date)}</div>
          <div><span className="font-medium text-gray-900">Time:</span> {formatTime(activeBooking.booking_time)}</div>
          <div><span className="font-medium text-gray-900">Booking Received At:</span> {formatDateTime(activeBooking.created_at)}</div>
          <div><span className="font-medium text-gray-900">Duration:</span> {activeBooking.duration_minutes ? `${activeBooking.duration_minutes} min` : "-"}</div>
          <div><span className="font-medium text-gray-900">Source:</span> {activeBooking.source || "-"}</div>
          <div><span className="font-medium text-gray-900">Booking Code:</span> {activeBooking.booking_code || activeBooking.customer_booking_number || "-"}</div>
          <div className="sm:col-span-2"><span className="font-medium text-gray-900">Special Request:</span> {activeBooking.special_request || "-"}</div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={acknowledgeBooking}
            disabled={ackLoading}
            className="h-10 w-full rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {ackLoading ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
