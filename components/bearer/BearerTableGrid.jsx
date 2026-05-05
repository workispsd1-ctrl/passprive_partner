"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  AlertCircle,
  LayoutGrid,
  Map as MapIcon,
} from "lucide-react";
import Link from "next/link";

const TABLE_BLINK_COLORS = [
  { ring: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  { ring: "#06b6d4", glow: "rgba(6,182,212,0.35)" },
  { ring: "#22c55e", glow: "rgba(34,197,94,0.35)" },
  { ring: "#a855f7", glow: "rgba(168,85,247,0.35)" },
  { ring: "#ef4444", glow: "rgba(239,68,68,0.35)" },
];

function blinkAccent(tableNo) {
  const n = Number(tableNo || 0);
  if (!Number.isInteger(n) || n <= 0) return TABLE_BLINK_COLORS[0];
  return TABLE_BLINK_COLORS[(n - 1) % TABLE_BLINK_COLORS.length];
}

export default function BearerTableGrid({ restaurantId, initialLayouts = [] }) {
  const [loading, setLoading] = useState(true);
  const [layouts, setLayouts] = useState(initialLayouts);
  const [orders, setOrders] = useState([]);
  const [blinkingTables, setBlinkingTables] = useState({});
  const [viewMode, setViewMode] = useState("layout"); // 'layout' or 'grid'
  const realtimeCleanupRef = useRef(null);

  useEffect(() => {
    if (!restaurantId) return;
    
    if (initialLayouts && initialLayouts.length > 0) {
        setLayouts(initialLayouts);
    }

    init();
    return () => {
      if (realtimeCleanupRef.current) realtimeCleanupRef.current();
    };
  }, [restaurantId, initialLayouts]);

  async function init() {
    setLoading(true);
    await Promise.all([
      fetchLayoutsIfNeeded(),
      fetchOrders()
    ]);
    realtimeCleanupRef.current = subscribeRealtime();
    setLoading(false);
  }

  async function fetchLayoutsIfNeeded() {
    if (layouts && layouts.length > 0) return;

    try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const res = await fetch(`/api/bearer/profile`, {
            headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        const payload = await res.json();
        if (payload.ok && payload.table_layouts) {
            setLayouts(payload.table_layouts);
        }
    } catch (err) {
        console.error("Failed to fetch layouts in grid:", err);
    }
  }

  async function fetchOrders() {
    const { data } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (data) setOrders(data);
  }

  function subscribeRealtime() {
    const channel = supabaseBrowser
      .channel(`bearer-tables-visual-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_table_bookings", filter: `restaurant_id=eq.${restaurantId}` },
        () => fetchOrders()
      )
      .subscribe();
    return () => supabaseBrowser.removeChannel(channel);
  }

  const tableCards = useMemo(() => {
    const cards = layouts.map((layout) => {
      const tableOrders = orders.filter((o) => Number(o?.table_no || 0) === Number(layout.table_no));
      const latest = [...tableOrders].sort(
        (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
      )[0] || null;
      
      const status = String(latest?.booking_status || "").toUpperCase();
      const paymentStatus = String(latest?.payment_status || "").toUpperCase();
      const isOccupied = Boolean(
        latest &&
          status !== "CANCELLED" &&
          !(status === "PAID" || paymentStatus === "PAID" || paymentStatus === "COMPLETED")
      );

      return {
        ...layout,
        latest,
        isOccupied,
        isBlinking: Boolean(blinkingTables[String(layout.table_no)]),
        blinkColor: blinkAccent(layout.table_no),
      };
    });
    
    return cards.sort((a, b) => {
      const aNum = parseInt(String(a.table_no || 0).trim(), 10) || 0;
      const bNum = parseInt(String(b.table_no || 0).trim(), 10) || 0;
      return aNum - bNum;
    });
  }, [layouts, orders, blinkingTables]);

  if (loading && layouts.length === 0) {
    return (
      <div className="h-96 flex flex-col items-center justify-center bg-white rounded-[3rem] border border-dashed border-slate-200">
        <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-400 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">Building Floor Plan...</p>
      </div>
    );
  }

  if (layouts.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-white rounded-[3rem] border border-dashed border-slate-200 p-8 text-center">
        <AlertCircle className="h-10 w-10 text-slate-300 mb-3" />
        <p className="text-slate-600 font-bold">Floor Plan Empty</p>
        <p className="text-slate-400 text-xs mt-1">No tables found for this restaurant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setViewMode("layout")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === "layout" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" /> Floor Plan
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 w-full gap-6 sm:gap-7 lg:gap-8">
          {tableCards && tableCards.length > 0 ? (
            tableCards.map((table) => (
              <TableCard key={table.id} table={table} isGrid />
            ))
          ) : (
            <div className="text-center py-8 text-slate-500">No tables found</div>
          )}
        </div>
      ) : (
        <div className="relative w-full aspect-[16/10] sm:aspect-video bg-slate-50/50 rounded-[3rem] border-2 border-slate-100 overflow-hidden shadow-inner p-4">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />
          
          {tableCards && tableCards.length > 0 ? (
            tableCards.map((table) => {
              const x = Number(table.pos_x || 0);
              const y = Number(table.pos_y || 0);
              
              return (
                <div
                  key={table.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
                  style={{ left: `${x}%`, top: `${y}%`, zIndex: table.isOccupied ? 20 : 10 }}
                >
                  <TableCard table={table} />
                </div>
              );
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-slate-500">No tables on floor plan</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TableCard({ table, isGrid = false }) {
  const shapeClass = table.shape === "circle" ? "rounded-[1.5rem]" : "rounded-[1.5rem]";
  const occupied = Boolean(table.isOccupied);
  const stateLabel = occupied ? "ORDERING" : "EMPTY";
  const stateClass = occupied ? "text-emerald-700" : "text-slate-500";
  const borderClass = occupied
    ? "border-emerald-400 bg-emerald-50/60"
    : "border-slate-200 bg-white";

  return (
    <Link
      href={`/restaurant/bearer/table/${table.table_no}`}
      className={`group relative flex w-full overflow-hidden border-2 ${shapeClass} ${borderClass} px-8 py-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:translate-y-[-2px] ${
        isGrid ? "min-h-[12rem] sm:min-h-[13rem]" : "min-w-[180px] sm:min-w-[200px] min-h-[140px]"
      }`}
      style={table.isBlinking ? { borderColor: table.blinkColor.ring, boxShadow: `0 0 20px ${table.blinkColor.glow}` } : {}}
    >
      <div className="flex w-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${occupied ? "text-emerald-700" : "text-slate-500"}`}>
            TABLE
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-3">
          <span className={`text-5xl font-black leading-tight sm:text-6xl ${occupied ? "text-slate-950" : "text-slate-900"}`}>
            {table.table_no}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${stateClass}`}>
            {stateLabel}
          </span>
          <span className={`text-[11px] font-semibold ${occupied ? "text-emerald-600" : "text-slate-400"}`}>
            {table.label || `T-${table.table_no}`}
          </span>
        </div>
      </div>

      {occupied && <div className="absolute inset-x-0 top-0 h-1 bg-emerald-400" />}
    </Link>
  );
}
