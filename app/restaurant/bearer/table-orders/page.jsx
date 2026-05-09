"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Plus, Minus, ShoppingCart, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `MUR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeSections(menuObj) {
  const sections = Array.isArray(menuObj?.sections) ? menuObj.sections : [];
  return sections
    .map((s) => ({
      ...s,
      items: (Array.isArray(s?.items) ? s.items : []).filter((i) => i?.is_available !== false),
    }))
    .filter((s) => s.items.length > 0);
}

export default function BearerTableOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState(null);

  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [sections, setSections] = useState([]);
  const [tables, setTables] = useState([]);

  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/bearer/profile", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load menu.");

      setRestaurantName(json?.restaurant_name || json?.restaurant?.name || "Restaurant");
      setSections(safeSections(json?.menu || json?.restaurant?.menu || {}));
      const tableRows = Array.isArray(json?.tables) ? json.tables : (Array.isArray(json?.table_layouts) ? json.table_layouts : []);
      setTables(tableRows);
      if (tableRows.length && !selectedTable) setSelectedTable(tableRows[0].table_no);
    } catch (e) {
      setError(e?.message || "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.qty || 0), 0),
    [cartItems]
  );
  const tax = useMemo(() => Number(((subtotal * 15) / 100).toFixed(2)), [subtotal]);
  const total = useMemo(() => Number((subtotal + tax).toFixed(2)), [subtotal, tax]);

  const addItem = (item, section) => {
    setCart((prev) => {
      const key = String(item.id);
      const current = prev[key];
      const qty = Number(current?.qty || 0) + 1;
      return {
        ...prev,
        [key]: {
          item_id: key,
          name: item.name,
          unit_price: Number(item.price || 0),
          qty,
          section_name: section?.name || "",
        },
      };
    });
  };

  const removeItem = (itemId) => {
    setCart((prev) => {
      const key = String(itemId);
      const current = prev[key];
      if (!current) return prev;
      const nextQty = Number(current.qty || 0) - 1;
      if (nextQty <= 0) {
        const clone = { ...prev };
        delete clone[key];
        return clone;
      }
      return { ...prev, [key]: { ...current, qty: nextQty } };
    });
  };

  const placeOrder = async () => {
    setError("");
    if (!cartItems.length) {
      setError("Please add at least one item.");
      return;
    }
    if (!selectedTable) {
      setError("Please select a table.");
      return;
    }
    if (placing) return;

    setPlacing(true);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      // Get restaurant_id from bearer profile
      const profileRes = await fetch("/api/bearer/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileJson = await profileRes.json();
      if (!profileRes.ok || !profileJson?.ok) throw new Error("Failed to get restaurant info.");
      const restaurantId = profileJson?.restaurant_id || profileJson?.restaurant?.id;
      if (!restaurantId) throw new Error("Restaurant ID not found.");

      const orderSubtotal = cartItems.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.qty || 0), 0);
      const subtotalFixed = Number(orderSubtotal.toFixed(2));
      const taxAmount = Number(((subtotalFixed * 15) / 100).toFixed(2));
      const totalAmount = Number((subtotalFixed + taxAmount).toFixed(2));

      const payload = {
        action: "upsert",
        target_order_id: null,
        payload: {
          restaurant_id: restaurantId,
          table_no: Number(selectedTable),
          customer_name: "Staff Order",
          customer_phone: null,
          notes: notes.trim() || null,
          order_items: cartItems.map((it) => ({
            item_id: it.item_id,
            name: it.name,
            qty: Number(it.qty || 0),
            unit_price: Number(it.unit_price || 0),
            line_total: Number((it.unit_price * it.qty).toFixed(2)),
          })),
          subtotal_amount: subtotalFixed,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_method: "CASH",
          payment_status: "PENDING",
          booking_status: "PLACED",
          source: "bearer_platform",
          order_details: {
            placed_by: "bearer",
            is_staff_initiated: true,
          },
        },
        bill_ready: false,
      };

      const res = await fetch("/api/public-menu/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to place order.");

      toast.success(`Order placed for Table ${selectedTable}!`);

      setCart({});
      setNotes("");
    } catch (e) {
      setError(e?.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[280px_1fr_360px] animate-pulse">
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`table-sk-${i}`} className="h-20 rounded-2xl bg-slate-200" />
          ))}
        </div>
        
        <div className="space-y-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`item-sk-${i}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="h-32 rounded-xl bg-slate-100" />
                <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`cart-sk-${i}`} className="h-20 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Menu Section */}
      <div className="space-y-4">
        {sections.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No menu items available.</div>
        ) : (
          sections.map((section) => (
            <div key={section.id || section.name} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">{section.name}</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => {
                  const qty = Number(cart[item.id]?.qty || 0);
                  const img = Array.isArray(item.image_urls) ? item.image_urls[0] : "";
                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="h-56 rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                        {img ? <img src={img} alt={item.name} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-900 line-clamp-1">{item.name}</div>
                      <div className="text-xs text-slate-500 line-clamp-2 min-h-[1.5rem]">{item.description || "No description"}</div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-sm font-bold text-slate-900">{money(item.price)}</div>
                        <div className="inline-flex items-center gap-1">
                          {qty > 0 ? (
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-700 inline-flex items-center justify-center"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          ) : null}
                          {qty > 0 ? <span className="min-w-6 text-center text-sm font-semibold">{qty}</span> : null}
                          <button
                            type="button"
                            onClick={() => addItem(item, section)}
                            className="h-8 w-8 rounded-lg border border-emerald-700 bg-emerald-600 text-white inline-flex items-center justify-center"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Order Cart Sidebar */}
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
          <ShoppingCart className="h-4 w-4" /> Order Cart
        </div>

        <div className="space-y-4">
          {/* Table Selection Dropdown */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">Select Table</label>
            <select
              value={selectedTable || ""}
              onChange={(e) => setSelectedTable(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-bold text-slate-900 appearance-none cursor-pointer focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">Choose table</option>
              {tables.map((t) => (
                <option key={t.table_no} value={t.table_no}>
                  T{t.table_no} • {t.label || `T${t.table_no}`}
                </option>
              ))}
            </select>
          </div>

          {/* Selected Table Display */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">Selected Table</label>
            <div className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-bold text-slate-900">
              {selectedTable ? `Table ${selectedTable}` : "No table selected"}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special requests for the kitchen"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm min-h-[100px] resize-none"
            />
          </div>

          {/* Cart Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="max-h-40 space-y-1 overflow-auto pr-1">
              {cartItems.length === 0 ? (
                <div className="text-xs text-slate-500">No items selected.</div>
              ) : (
                cartItems.map((it) => (
                  <div key={it.item_id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                    <span className="truncate">{it.name} x {it.qty}</span>
                    <span>{money(Number(it.qty || 0) * Number(it.unit_price || 0))}</span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              <div className="flex items-center justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="flex items-center justify-between"><span>Tax</span><span>{money(tax)}</span></div>
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900"><span>Total</span><span>{money(total)}</span></div>
            </div>
          </div>

          {/* Error Message */}
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

          {/* Place Order Button */}
          <button
            type="button"
            onClick={placeOrder}
            disabled={placing || cartItems.length === 0 || !selectedTable}
            className="w-full h-12 rounded-xl bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white text-base font-semibold transition-colors disabled:cursor-not-allowed"
          >
            {placing ? "Placing..." : "Place Order"}
          </button>
        </div>
      </aside>
    </div>
  );
}
