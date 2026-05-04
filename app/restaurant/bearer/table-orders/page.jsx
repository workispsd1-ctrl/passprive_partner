"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ShieldAlert } from "lucide-react";
import BearerTableGrid from "@/components/bearer/BearerTableGrid";

export default function BearerTableOrdersPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [tableLayouts, setTableLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token;
        
        if (!token) {
          setError("No active session found.");
          return;
        }

        const res = await fetch("/api/bearer/profile", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await res.json();

        if (!res.ok || !payload.ok) {
          setError(payload.error || "Failed to load restaurant profile.");
          return;
        }

        setRestaurantId(payload.restaurant.id);
        setTableLayouts(payload.table_layouts || []);
      } catch (err) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    }
    init();
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Table Orders</h1>
        <p className="text-slate-500 font-medium">Select a table from the layout to manage orders</p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        {restaurantId ? (
          <BearerTableGrid restaurantId={restaurantId} initialLayouts={tableLayouts} />
        ) : (
          <div className="h-96 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-400 font-medium">Initializing layout view...</p>
          </div>
        )}
      </div>
    </div>
  );
}
