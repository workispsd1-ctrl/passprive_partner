"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId, RESTAURANT_CHANGED_EVENT } from "@/lib/restaurant-partner/activeRestaurant";

const SAFETY_MS = 60000;
const OFFLINE_MS = 20000;

const listeners = new Set();
let channel = null;
let topic = "";
let users = 0;
let live = false;

function disconnect() {
  if (channel) supabaseBrowser.removeChannel(channel);
  channel = null;
  topic = "";
  live = false;
}

async function connect(restaurantId) {
  const next = `till:${restaurantId}`;
  if (topic === next) return;
  disconnect();
  topic = next;
  await supabaseBrowser.realtime.setAuth().catch(() => {});
  if (topic !== next || channel) return;
  channel = supabaseBrowser
    .channel(next, { config: { private: true } })
    .on("broadcast", { event: "change" }, (msg) => {
      const table = String(msg?.payload?.t || "");
      listeners.forEach((fn) => fn(table));
    })
    .subscribe((status) => {
      live = status === "SUBSCRIBED";
    });
}

export function useTillPush(refresh, tables) {
  const refreshRef = useRef(refresh);
  const key = tables.join(",");

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    let timer = null;
    let last = Date.now();
    const wanted = new Set(key.split(","));
    const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const run = () => {
      last = Date.now();
      refreshRef.current?.();
    };
    const onChange = (table) => {
      if (!wanted.has(table) || timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (visible()) run();
      }, 300);
    };
    const join = async () => {
      const rid = await getActiveRestaurantId().catch(() => null);
      if (alive && rid) connect(rid);
    };
    listeners.add(onChange);
    users += 1;
    join();
    const onVisible = () => visible() && run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(RESTAURANT_CHANGED_EVENT, join);
    const safety = setInterval(() => {
      if (visible() && Date.now() - last >= (live ? SAFETY_MS : OFFLINE_MS)) run();
    }, OFFLINE_MS);
    return () => {
      alive = false;
      listeners.delete(onChange);
      if (timer) clearTimeout(timer);
      clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(RESTAURANT_CHANGED_EVENT, join);
      users -= 1;
      if (users === 0) disconnect();
    };
  }, [key]);
}
