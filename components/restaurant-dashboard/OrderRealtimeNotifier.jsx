"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const ORDER_FIELDS = "id,restaurant_id,order_number,customer_name,customer_phone,items,total_amount,payment_status,pickup_code,pickup_eta,created_at";
const POLL_MS = 5000;

function money(n) {
  return `MUR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { timeZone: "Indian/Mauritius", hour: "numeric", minute: "2-digit" });
}

export default function OrderRealtimeNotifier() {
  const router = useRouter();
  const [queue, setQueue] = useState([]);
  const activeOrder = queue[0] || null;

  const startedAtRef = useRef(new Date().toISOString());
  const seenIdsRef = useRef(new Set());
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const pendingPlayRef = useRef(false);

  const stopBuzzer = () => {
    pendingPlayRef.current = false;
    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
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
    } catch {
      pendingPlayRef.current = true;
    }
  };

  useEffect(() => {
    const audio = new Audio("/sound.wav");
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;

    const unlock = async () => {
      if (audioUnlockedRef.current) return;
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audioUnlockedRef.current = true;
        if (pendingPlayRef.current) {
          pendingPlayRef.current = false;
          playBuzzer();
        }
      } catch {}
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    let active = true;
    const pull = async () => {
      const { data } = await supabaseBrowser
        .from("restaurant_orders")
        .select(ORDER_FIELDS)
        .gt("created_at", startedAtRef.current)
        .order("created_at", { ascending: true })
        .limit(20);
      if (!active) return;
      const fresh = (data || []).filter((o) => !seenIdsRef.current.has(String(o.id)));
      if (!fresh.length) return;
      fresh.forEach((o) => seenIdsRef.current.add(String(o.id)));
      setQueue((prev) => [...prev, ...fresh]);
      playBuzzer();
    };

    pull();
    const timer = window.setInterval(pull, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      stopBuzzer();
    };
  }, []);

  const close = (goToOrders) => {
    if (queue.length <= 1) stopBuzzer();
    setQueue((prev) => prev.slice(1));
    if (goToOrders) router.push("/restaurant/orders");
  };

  if (!activeOrder) return null;

  const items = Array.isArray(activeOrder.items) ? activeOrder.items : [];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-orange-100 bg-orange-50 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF4800] text-white">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">New Order & Collect order</h3>
            <p className="text-xs text-gray-600">
              {activeOrder.order_number || "Order"} · received {fmtTime(activeOrder.created_at)}
              {queue.length > 1 ? ` · ${queue.length - 1} more waiting` : ""}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-800">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">Customer</span><div className="font-medium">{activeOrder.customer_name || "Guest"}</div></div>
            <div><span className="text-gray-500">Phone</span><div className="font-medium">{activeOrder.customer_phone || "—"}</div></div>
            <div><span className="text-gray-500">Pickup code</span><div className="font-semibold tracking-wide">{activeOrder.pickup_code || "—"}</div></div>
            <div><span className="text-gray-500">Payment</span><div className="font-medium">{String(activeOrder.payment_status || "PENDING")}</div></div>
          </div>

          <div className="max-h-44 overflow-auto rounded-xl border border-gray-200">
            {items.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No item details.</div>
            ) : (
              items.map((it, idx) => (
                <div key={`${activeOrder.id}-${idx}`} className="flex justify-between gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0">
                  <span>{it.qty} × {it.name}</span>
                  <span className="font-medium">{money(it.line_total ?? (Number(it.unit_price) || 0) * (Number(it.qty) || 0))}</span>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-between text-base font-semibold text-gray-900">
            <span>Total</span>
            <span>{money(activeOrder.total_amount)}</span>
          </div>
        </div>

        <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={() => close(false)}
            className="h-10 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="h-10 flex-1 rounded-xl bg-[#FF4800] text-sm font-semibold text-white hover:bg-[#E64000]"
          >
            View order
          </button>
        </div>
      </div>
    </div>
  );
}
