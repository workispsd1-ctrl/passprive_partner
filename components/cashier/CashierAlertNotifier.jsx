"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "MUR", maximumFractionDigits: 2 }).format(num);
}

export default function CashierAlertNotifier() {
  const router = useRouter();
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [visible, setVisible] = useState(false);

  const seenIdsRef = useRef(new Set());
  const pollRef = useRef(null);
  const activeRef = useRef(null);
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const pendingPlayRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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
        if (pendingPlayRef.current && activeRef.current) {
          pendingPlayRef.current = false;
          playBuzzer();
        }
      } catch {}
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

  const showNext = () => {
    setQueue((prev) => {
      if (!prev.length) {
        setActive(null);
        setVisible(false);
        stopBuzzer();
        return prev;
      }
      const [next, ...rest] = prev;
      setActive(next);
      setVisible(true);
      playBuzzer();
      return rest;
    });
  };

  const acknowledge = () => {
    stopBuzzer();
    setVisible(false);
    setActive(null);
    window.setTimeout(showNext, 120);
  };

  const openTarget = () => {
    if (!active) return;
    const target = active.type === "BOOKING" ? "/cashier/bookings" : "/cashier/orders";
    acknowledge();
    router.push(target);
  };

  const notifyHidden = (item) => {
    if (typeof window === "undefined" || document.visibilityState !== "hidden") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
      return;
    }
    if (Notification.permission !== "granted") return;
    try {
      new Notification(item.type === "TABLE_ORDER" ? "New Table Order" : "New Booking", {
        body:
          item.type === "TABLE_ORDER"
            ? `Table ${item.table_no || "—"} • ${item.customer_name || "Guest"} • ${money(item.total_amount)}`
            : `${item.customer_name || "Guest"} • ${item.party_size || 0} guests`,
        tag: `cashier-${item.type}-${item.id}`,
      });
    } catch {}
  };

  useEffect(() => {
    let activeTurn = true;

    const enqueueIfNew = (item) => {
      if (!item?.id) return;
      const key = `${item.type}:${item.id}`;
      if (seenIdsRef.current.has(key)) return;
      seenIdsRef.current.add(key);

      notifyHidden(item);

      setQueue((prev) => {
        if (prev.some((x) => `${x.type}:${x.id}` === key)) return prev;
        if (activeRef.current && `${activeRef.current.type}:${activeRef.current.id}` === key) return prev;
        return [...prev, item];
      });
    };

    const poll = async (seed = false) => {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/cashier/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) return;

      const tableOrders = (json?.rows?.table_orders || []).map((r) => ({ ...r, type: "TABLE_ORDER" }));
      const bookings = (json?.rows?.bookings || []).map((r) => ({ ...r, type: "BOOKING" }));
      const all = [...tableOrders, ...bookings]
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .slice(-20);

      if (seed) {
        all.forEach((x) => seenIdsRef.current.add(`${x.type}:${x.id}`));
        return;
      }

      all.forEach(enqueueIfNew);
    };

    poll(true);
    pollRef.current = window.setInterval(() => {
      if (!activeTurn) return;
      poll(false);
    }, 5000);

    return () => {
      activeTurn = false;
      stopBuzzer();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible && !active && queue.length > 0) showNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, visible, active]);

  if (!visible || !active) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#771FA8]/20 bg-[#F4E7D1] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#771FA8]/20 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {active.type === "TABLE_ORDER" ? "New Table Order" : "New Booking"}
          </h3>
          <button
            type="button"
            onClick={acknowledge}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white inline-flex items-center justify-center"
          >
            <X className="h-4 w-4 text-slate-700" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm text-slate-800">
          <div><span className="font-semibold">Customer:</span> {active.customer_name || "Guest"}</div>
          <div><span className="font-semibold">Phone:</span> {active.customer_phone || "—"}</div>
          {active.type === "TABLE_ORDER" ? (
            <>
              <div><span className="font-semibold">Table:</span> {active.table_no || "—"}</div>
              <div><span className="font-semibold">Amount:</span> {money(active.total_amount)}</div>
            </>
          ) : (
            <>
              <div><span className="font-semibold">Guests:</span> {active.party_size || 0}</div>
              <div><span className="font-semibold">When:</span> {active.booking_date || "—"} {String(active.booking_time || "").slice(0, 5)}</div>
            </>
          )}
          <div><span className="font-semibold">Received:</span> {fmtDateTime(active.created_at)}</div>
        </div>
        <div className="px-4 pb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={acknowledge}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={openTarget}
            className="h-9 rounded-lg border border-violet-700 bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
