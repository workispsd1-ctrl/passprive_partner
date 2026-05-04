"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { 
  ChevronLeft, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Search, 
  Utensils, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  X,
  ShieldAlert,
  Send
} from "lucide-react";
import { toast } from "sonner";

// Reusing some logic from public-menu for consistency
function safeMenu(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sections: [] };
  }
  return {
    ...raw,
    sections: Array.isArray(raw.sections) ? raw.sections : [],
  };
}

function makeUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function BearerTableOrderPage() {
  const params = useParams();
  const router = useRouter();
  const tableNo = params.tableNo;

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState({ sections: [] });
  const [activeOrder, setActiveOrder] = useState(null);
  const [cart, setCart] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  const restaurantId = useMemo(() => restaurant?.id, [restaurant]);

  useEffect(() => {
    init();
  }, [tableNo]);

  async function init() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token;
      if (!token) {
          setError("No active session. Please sign in.");
          setLoading(false);
          return;
      }

      const res = await fetch("/api/bearer/profile", {
          headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json();

      if (!res.ok || !payload.ok) {
          setError(payload.error || "Failed to load restaurant data.");
          setLoading(false);
          return;
      }

      const resData = payload.restaurant;
      setRestaurant(resData);
      setMenu(safeMenu(resData.menu));

      await fetchActiveOrder(resData.id, tableNo);
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchActiveOrder(rid, tno) {
    const { data } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .select("*")
      .eq("restaurant_id", rid)
      .eq("table_no", Number(tno))
      .not("booking_status", "in", '("PAID","CANCELLED","COMPLETED")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveOrder(data || null);
  }

  const categories = useMemo(() => {
    const cats = ["All"];
    menu.sections.forEach(s => {
      if (s.name && !cats.includes(s.name)) cats.push(s.name);
    });
    return cats;
  }, [menu]);

  const filteredItems = useMemo(() => {
    let all = [];
    menu.sections.forEach(s => {
      if (selectedCategory === "All" || s.name === selectedCategory) {
        const items = (s.items || []).map(i => ({ ...i, sectionName: s.name }));
        all = [...all, ...items];
      }
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      all = all.filter(i => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }

    return all;
  }, [menu, selectedCategory, searchQuery]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(() => cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((sum, it) => sum + Number(it.qty || 0), 0), [cartItems]);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          ...item,
          qty: (existing?.qty || 0) + 1
        }
      };
    });
    toast.success(`Added ${item.name}`, { duration: 1000 });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [itemId]: { ...existing, qty: existing.qty - 1 }
      };
    });
  };

  const handleSubmitOrder = async () => {
    if (cartItems.length === 0) return;
    setIsSubmitting(true);

    try {
      const subtotal = Number(cartTotal.toFixed(2));
      const tax = Number((subtotal * 0.15).toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));

      const sessionId = activeOrder?.session_id || makeUuid();

      const commonPayload = {
        session_id: sessionId,
        restaurant_id: restaurantId,
        table_no: Number(tableNo),
        customer_name: "Staff Order",
        customer_phone: null,
        order_items: cartItems.map(it => ({
          item_id: it.id,
          name: it.name,
          qty: Number(it.qty),
          unit_price: Number(it.price),
          line_total: Number((it.price * it.qty).toFixed(2))
        })),
        order_details: {
          placed_by: "bearer",
          staff_name: "Bearer Staff",
          version: 1,
          is_staff_initiated: true,
          session_id: sessionId
        },
        subtotal_amount: subtotal,
        tax_amount: tax,
        total_amount: total,
        payment_method: "CASH", 
        payment_status: "PENDING",
        booking_status: "PLACED", 
        source: "bearer_platform",
        notes: notes.trim() || null,
      };

      // Use the robust UPSERT API to handle merging items into existing table sessions
      const upsertRes = await fetch("/api/public-menu/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          target_order_id: activeOrder?.id || null,
          payload: commonPayload,
          bill_ready: false, // Bearers don't mark bill as ready from this flow
        }),
      });

      const upsertJson = await upsertRes.json();

      if (upsertRes.ok && upsertJson?.ok) {
        toast.success("Order booked for table!");
        setCart({});
        setNotes("");
        setShowCart(false);
        
        // Refresh active order state
        await fetchActiveOrder(restaurantId, tableNo);
      } else {
        throw new Error(upsertJson?.error || "Failed to save order.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to place order: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
          <ShieldAlert className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Unable to load menu</h2>
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

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Fetching restaurant menu...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 -m-5 overflow-hidden rounded-[2.5rem] border border-slate-200">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 sm:p-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="h-12 w-12 rounded-2xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none">Table {tableNo}</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Bearer Ordering Flow</p>
          </div>
        </div>
        
        {activeOrder && (
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Active Table Session</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Categories */}
        <div className="w-56 bg-white border-r border-slate-100 overflow-y-auto hidden lg:block">
          <div className="p-4 space-y-1">
            <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Categories</p>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-full text-left px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                  selectedCategory === cat 
                    ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <input 
                type="text"
                placeholder="Search for dishes, drinks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-16 pl-14 pr-6 rounded-[2rem] border-none bg-white shadow-sm focus:ring-4 focus:ring-slate-900/5 transition-all text-sm font-bold"
              />
            </div>

            {/* Mobile Categories Scroll */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                    selectedCategory === cat ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 border border-slate-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex gap-5 group hover:border-slate-300 transition-all">
                  <div className="h-24 w-24 rounded-[1.5rem] bg-slate-50 shrink-0 overflow-hidden border border-slate-50">
                    {item.image_urls?.[0] ? (
                      <img src={item.image_urls[0]} alt={item.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-200">
                        <Utensils className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-black text-slate-900 truncate leading-tight">{item.name}</h3>
                        <span className="text-sm font-black text-slate-900 shrink-0">MUR {item.price}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium line-clamp-2 mt-1 uppercase tracking-tight">{item.description || "Freshly prepared"}</p>
                    </div>
                    
                    <div className="mt-4 flex justify-end">
                      {cart[item.id] ? (
                        <div className="flex items-center gap-4 bg-slate-900 rounded-2xl p-1.5 shadow-lg shadow-slate-200">
                          <button onClick={() => removeFromCart(item.id)} className="h-8 w-8 rounded-xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-black w-4 text-center text-white">{cart[item.id].qty}</span>
                          <button onClick={() => addToCart(item)} className="h-8 w-8 rounded-xl bg-white text-slate-900 flex items-center justify-center hover:bg-slate-50 transition-colors">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => addToCart(item)}
                          disabled={!item.is_available}
                          className="h-10 px-6 rounded-2xl bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all disabled:opacity-30 disabled:border-slate-200 disabled:text-slate-300"
                        >
                          {item.is_available ? "Add Item" : "Out of Stock"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <div className="py-32 text-center">
                <AlertCircle className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No matching dishes</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart Drawer Overlay */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setShowCart(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-[4rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-500"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Review Order</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Table {tableNo} • {cartCount} Items</p>
              </div>
              <button onClick={() => setShowCart(false)} className="h-14 w-14 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all">
                <X className="h-6 w-6 text-slate-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {cartItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-6 p-6 rounded-[2rem] bg-slate-50 border border-slate-100">
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-900 truncate">{item.name}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">MUR {item.price} UNIT</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="flex items-center gap-4 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
                      <button onClick={() => removeFromCart(item.id)} className="h-10 w-10 rounded-xl hover:bg-slate-50 flex items-center justify-center transition-colors">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-base font-black w-6 text-center">{item.qty}</span>
                      <button onClick={() => addToCart(item)} className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-colors">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="text-lg font-black text-slate-900 w-24 text-right">MUR {item.price * item.qty}</span>
                  </div>
                </div>
              ))}

              <div className="pt-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Kitchen Notes</label>
                <textarea 
                  placeholder="E.g. No spicy, allergens, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-32 p-6 rounded-[2rem] bg-slate-50 border-none text-sm font-bold focus:ring-4 focus:ring-slate-900/5 placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="p-8 bg-slate-900 text-white rounded-t-[3rem] space-y-6">
              <div className="flex justify-between items-center px-4">
                <span className="text-slate-400 font-black uppercase tracking-widest text-xs">Total Order Value</span>
                <span className="text-3xl font-black">MUR {cartTotal}</span>
              </div>
              <button 
                onClick={handleSubmitOrder}
                disabled={isSubmitting}
                className="w-full h-20 rounded-[2rem] bg-white text-slate-900 font-black text-xl shadow-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="h-6 w-6 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                ) : (
                  <>Book Table Order <Send className="h-6 w-6" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart Button */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-10 left-10 right-10 z-40 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <button 
            onClick={() => setShowCart(true)}
            className="w-full max-w-lg mx-auto h-20 bg-slate-900 text-white rounded-[2rem] shadow-2xl flex items-center justify-between px-8 hover:scale-[1.02] active:scale-[0.98] transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div className="text-left">
                <span className="block font-black text-sm">{cartCount} Items Selected</span>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Review & Book Table Order</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-2xl font-black">MUR {cartTotal}</span>
              <span className="h-8 w-px bg-white/10" />
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-slate-900 shadow-sm">
                <Plus className="h-5 w-5" />
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
