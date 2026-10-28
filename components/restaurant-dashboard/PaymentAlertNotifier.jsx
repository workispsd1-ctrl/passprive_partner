"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useI18n } from "@/lib/i18n";

const POLL_MS = 8000;
const LOOKBACK_MS = 120000;

export function paymentTypeKey(p) {
  if (p.payment_context === "TABLE_ORDERS") return "payments.type.table";
  return p.is_order ? "payments.type.order" : "payments.type.bill";
}

export function money(amount, currency = "MUR") {
  return `${currency} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentAlertNotifier() {
  const router = useRouter();
  const { t, fmt } = useI18n();
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(new Set());
  const sinceRef = useRef(null);
  const audioRef = useRef(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio("/sound.wav");
    audio.preload = "auto";
    audioRef.current = audio;

    const unlock = async () => {
      if (unlockedRef.current) return;
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        unlockedRef.current = true;
      } catch {
        audio.muted = false;
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const chime = async () => {
      if (!unlockedRef.current) return;
      try {
        audio.currentTime = 0;
        await audio.play();
        window.setTimeout(() => {
          audio.pause();
          audio.currentTime = 0;
        }, 2500);
      } catch {}
    };

    let active = true;
    let timer = null;

    const fetchPayments = (since, limit) =>
      supabaseBrowser.rpc("partner_recent_payments", { p_restaurant_id: null, p_since: since, p_limit: limit });

    const poll = async () => {
      if (!sinceRef.current) return;
      const from = new Date(sinceRef.current.getTime() - LOOKBACK_MS).toISOString();
      const { data, error } = await fetchPayments(from, 50);
      if (!active || error || !Array.isArray(data) || data.length === 0) return;
      const fresh = data.filter((p) => !seenRef.current.has(p.id)).reverse();
      data.forEach((p) => seenRef.current.add(p.id));
      const newest = new Date(data[0].paid_at);
      if (newest > sinceRef.current) sinceRef.current = newest;
      if (!fresh.length) return;
      setQueue((prev) => [...prev, ...fresh]);
      chime();
    };

    const boot = async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      if (!active || !data?.user) return;
      const { data: latest, error } = await fetchPayments(null, 50);
      if (!active || error) return;
      (latest || []).forEach((p) => seenRef.current.add(p.id));
      sinceRef.current = latest?.[0]?.paid_at ? new Date(latest[0].paid_at) : new Date();
      timer = window.setInterval(poll, POLL_MS);
    };

    boot();

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      try {
        audio.pause();
      } catch {}
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => setQueue((prev) => prev.slice(1));

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[110] w-[calc(100%-2rem)] max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50">
            <CircleCheck className="h-6 w-6 text-green-600" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">{t("payments.received")}</div>
            <div className="mt-0.5 text-2xl font-bold text-gray-900">{money(current.amount, current.currency)}</div>
            <div className="mt-1 truncate text-sm text-gray-600">
              {t(paymentTypeKey(current))} · {current.customer || t("common.customer")} · {fmt.time(current.paid_at)}
            </div>
            {Number(current.bill_amount) > Number(current.amount) ? (
              <div className="text-xs text-gray-500">{t("payments.billTotal", { amount: money(current.bill_amount, current.currency) })}</div>
            ) : null}
            {current.restaurant_name ? <div className="truncate text-xs text-gray-400">{current.restaurant_name}</div> : null}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("payments.dismiss")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="text-xs text-gray-500">
            {queue.length > 1 ? t("payments.moreWaiting", { count: queue.length - 1 }) : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t("common.ok")}
            </button>
            <button
              type="button"
              onClick={() => {
                setQueue([]);
                router.push("/restaurant/transactions");
              }}
              className="h-8 rounded-lg bg-[#FF4800] px-3 text-xs font-semibold text-white hover:bg-[#E64000]"
            >
              {t("payments.viewAll")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
