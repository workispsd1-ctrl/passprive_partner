"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ShieldAlert
} from "lucide-react";
import Link from "next/link";
import BearerTableGrid from "@/components/bearer/BearerTableGrid";

export default function BearerDashboardPage() {
  const [stats, setStats] = useState({
    activeOrders: 0,
    pendingKitchen: 0,
    preparing: 0,
    cancelled: 0
  });
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState(null);
  const [tableLayouts, setTableLayouts] = useState([]);
  const [error, setError] = useState(null);

  const fetchDashboardData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        setError("No active session found.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/bearer/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        setError(payload.error || "Failed to load restaurant profile.");
        setLoading(false);
        return;
      }

      setRestaurantId(payload.restaurant.id);
      setTableLayouts(payload.table_layouts || []);
      if (payload.stats) {
        setStats(payload.stats);
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(true);

    // Refresh stats every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData(false);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
          <ShieldAlert className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2 max-w-md">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  const statCards = [
    { label: "Active Orders", value: stats.activeOrders, icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending Kitchen", value: stats.pendingKitchen, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Preparing", value: stats.preparing, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Cancelled", value: stats.cancelled, icon: AlertCircle, color: "text-rose-600", bg: "bg-rose-50" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 font-medium">Real-time overview of your restaurant status</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
            <div className={`h-14 w-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
              <stat.icon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-3xl font-black text-slate-900">{loading && !restaurantId ? "..." : stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Floor Plan</h2>
            <p className="text-slate-500 text-sm font-medium">Tap on a table to start a new order</p>
          </div>
          <Link 
            href="/restaurant/bearer/table-orders" 
            className="px-4 py-2 rounded-xl bg-violet-50 text-sm font-bold text-violet-600 hover:bg-violet-100 transition-colors"
          >
            View Live Orders →
          </Link>
        </div>

        {restaurantId ? (
          <BearerTableGrid restaurantId={restaurantId} initialLayouts={tableLayouts} />
        ) : (
          <div className="h-64 flex items-center justify-center bg-white rounded-[3rem] border border-dashed border-slate-200">
             <p className="text-slate-400 animate-pulse font-medium">Initializing layout...</p>
          </div>
        )}
      </div>
    </div>
  );
}
