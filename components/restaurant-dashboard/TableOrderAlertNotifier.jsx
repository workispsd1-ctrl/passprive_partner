"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useI18n } from "@/lib/i18n";
import { isStaffPlacedOrder } from "@/lib/staffOrder";

const TABLE_ORDER_FIELDS = [
  "id",
  "restaurant_id",
  "table_no",
  "customer_name",
  "customer_phone",
  "order_items",
  "order_details",
  "source",
  "notes",
  "total_amount",
  "payment_status",
  "booking_status",
  "created_at",
].join(",");

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "MUR",
    maximumFractionDigits: 2,
  }).format(num);
}

function paymentLabel(t, status) {
  const s = String(status || "PENDING").toUpperCase();
  const label = t(`payment.${s}`);
  return label === `payment.${s}` ? s : label;
}

function toItems(v) {
  return Array.isArray(v) ? v : [];
}

export default function TableOrderAlertNotifier() {
  const { t, fmt } = useI18n();
  const [queue, setQueue] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [visible, setVisible] = useState(false);

  const channelRef = useRef(null);
  const pollRef = useRef(null);
  const startedAtRef = useRef(new Date().toISOString());
  const seenIdsRef = useRef(new Set());
  const activeRef = useRef(null);

  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const pendingPlayRef = useRef(false);

  useEffect(() => {
    activeRef.current = activeOrder;
  }, [activeOrder]);

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
        setActiveOrder(null);
        setVisible(false);
        stopBuzzer();
        return prev;
      }
      const [next, ...rest] = prev;
      setActiveOrder(next);
      setVisible(true);
      playBuzzer();
      return rest;
    });
  };

  const acknowledge = () => {
    stopBuzzer();
    setVisible(false);
    setActiveOrder(null);
    window.setTimeout(showNext, 120);
  };

  useEffect(() => {
    let active = true;

    const queueOrder = (order) => {
      if (!order?.id) return;
      if (isStaffPlacedOrder(order) || String(order.booking_status || "").toUpperCase() === "SEATED") return;
      const id = String(order.id);
      if (seenIdsRef.current.has(id)) return;
      seenIdsRef.current.add(id);

      setQueue((prev) => {
        if (prev.some((o) => String(o.id) === id)) return prev;
        if (String(activeRef.current?.id || "") === id) return prev;
        return [...prev, order];
      });
    };

    const pullRecent = async () => {
      const { data } = await supabaseBrowser
        .from("restaurant_table_bookings")
        .select(TABLE_ORDER_FIELDS)
        .gt("created_at", startedAtRef.current)
        .order("created_at", { ascending: true })
        .limit(20);
      (data || []).forEach(queueOrder);
    };

    const setup = async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user || !active) return;

      channelRef.current = supabaseBrowser
        .channel("restaurant-table-order-buzzer-global")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "restaurant_table_bookings",
          },
          async (payload) => {
            const id = payload?.new?.id;
            if (!id) return;
            const { data: full } = await supabaseBrowser
              .from("restaurant_table_bookings")
              .select(TABLE_ORDER_FIELDS)
              .eq("id", id)
              .maybeSingle();
            if (!full) return;
            queueOrder(full);
          }
        )
        .subscribe();

      await pullRecent();
      pollRef.current = window.setInterval(pullRecent, 5000);
    };

    setup();

    return () => {
      active = false;
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
    if (!visible && !activeOrder && queue.length > 0) showNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, visible, activeOrder]);

  if (!visible || !activeOrder) return null;

  const items = toItems(activeOrder.order_items);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#FF4800]/20 bg-[#FFF7F4] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#FF4800]/20 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{t("tableAlert.title")}</h3>
          <button
            type="button"
            aria-label={t("tableAlert.close")}
            onClick={acknowledge}
            className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 text-sm text-gray-800">
          <p><span className="font-semibold">{t("tableAlert.table")}</span> {activeOrder.table_no || "—"}</p>
          <p><span className="font-semibold">{t("tableAlert.customer")}</span> {activeOrder.customer_name || t("common.guest")}</p>
          <p><span className="font-semibold">{t("tableAlert.phone")}</span> {activeOrder.customer_phone || "—"}</p>
          <p><span className="font-semibold">{t("tableAlert.amount")}</span> {money(activeOrder.total_amount)}</p>
          <p><span className="font-semibold">{t("tableAlert.payment")}</span> {paymentLabel(t, activeOrder.payment_status)}</p>
          <p><span className="font-semibold">{t("tableAlert.receivedAt")}</span> {activeOrder.created_at ? fmt.dateTime(activeOrder.created_at) : "—"}</p>

          <div className="pt-1">
            <div className="font-semibold text-gray-900 mb-1">{t("tableAlert.items")}</div>
            <div className="rounded-xl border border-gray-200 bg-white max-h-36 overflow-auto">
              {items.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-500">{t("tableAlert.noItems")}</div>
              ) : (
                items.map((it, idx) => (
                  <div key={`${activeOrder.id}-${idx}`} className="px-3 py-2 text-xs border-b last:border-b-0 border-gray-100 flex justify-between gap-2">
                    <span>{it.name} x {it.qty}</span>
                    <span className="font-semibold">{money((Number(it.unit_price ?? it.price) || 0) * (Number(it.qty) || 0))}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#FF4800]/20 bg-white">
          <button
            type="button"
            onClick={acknowledge}
            className="w-full h-10 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(91.59deg, #FF4800 2.56%, #FFA680 97.05%)" }}
          >
            {t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
