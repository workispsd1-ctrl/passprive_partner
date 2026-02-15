"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { showToast } from "@/components/restaurant-dashboard/useToast";

export default function OrderRealtimeNotifier() {
  const restaurantIdsRef = useRef(new Set());
  const seenOrderIdsRef = useRef(new Set());
  const audioRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    let active = true;

    const initAudio = () => {
      try {
        // public/sound.wav -> /sound.wav
        audioRef.current = new Audio("/sound.wav");
        audioRef.current.preload = "auto";
        audioRef.current.volume = 1.0;
      } catch (e) {
        console.error("[OrderRealtimeNotifier] audio init error:", e);
      }
    };

    const unlockAudio = async () => {
      if (!audioRef.current) return;
      try {
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // expected on some browsers until user gesture
      } finally {
        window.removeEventListener("click", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
      }
    };

    const playSound = async () => {
      if (!audioRef.current) return;
      try {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      } catch (e) {
        console.error("[OrderRealtimeNotifier] sound play error:", e);
      }
    };

    const boot = async () => {
      try {
        const { data: userRes, error: userErr } = await supabaseBrowser.auth.getUser();
        if (userErr) throw userErr;
        if (!userRes?.user?.id || !active) return;

        const userId = userRes.user.id;

        const { data: myRestaurants, error: restErr } = await supabaseBrowser
          .from("restaurants")
          .select("id")
          .eq("owner_user_id", userId);

        if (restErr) throw restErr;
        if (!active) return;

        restaurantIdsRef.current = new Set((myRestaurants || []).map((r) => String(r.id)));

        channelRef.current = supabaseBrowser
          .channel("restaurant-order-global-alerts")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "restaurant_orders" },
            async (payload) => {
              try {
                const row = payload?.new;
                if (!row) return;

                const belongsToMe = restaurantIdsRef.current.has(String(row.restaurant_id));
                if (!belongsToMe) return;

                if (seenOrderIdsRef.current.has(String(row.id))) return;
                seenOrderIdsRef.current.add(String(row.id));

                await playSound();

                showToast({
                  type: "success",
                  title: "New order received",
                  description: `Order ${row.order_number || ""} is waiting for action.`,
                });
              } catch (err) {
                console.error("[OrderRealtimeNotifier] insert handler error:", err);
                showToast({
                  type: "error",
                  title: "Order notifier error",
                  description: "Failed to process incoming order notification.",
                });
              }
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR") {
              console.error("[OrderRealtimeNotifier] realtime channel error");
              showToast({
                type: "error",
                title: "Realtime connection error",
                description: "Could not connect to order notifications.",
              });
            }
          });
      } catch (e) {
        console.error("[OrderRealtimeNotifier] boot error:", e);
        showToast({
          type: "error",
          title: "Notifier setup failed",
          description: e?.message || "Failed to start order notifications.",
        });
      }
    };

    initAudio();
    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    boot();

    return () => {
      active = false;
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);

      if (channelRef.current) {
        supabaseBrowser.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return null;
}
