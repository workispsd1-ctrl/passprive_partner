"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

export default function CashierOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [sections, setSections] = useState([]);
  const [tables, setTables] = useState([]);
  const [occupiedTableNos, setOccupiedTableNos] = useState([]);

  const [orderType, setOrderType] = useState("TABLE");
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/cashier/orders", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load menu.");

      setRestaurantName(json?.restaurant_name || "Restaurant");
      setSections(safeSections(json?.menu || {}));
      const tableRows = Array.isArray(json?.tables) ? json.tables : [];
      setTables(tableRows);
      setOccupiedTableNos(Array.isArray(json?.occupied_table_nos) ? json.occupied_table_nos.map((n) => Number(n)) : []);
      if (tableRows.length && !tableNo) setTableNo(String(tableRows[0].table_no || ""));
    } catch (e) {
      setError(e?.message || "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onTopRefresh = () => load();
    window.addEventListener("cashier:refresh", onTopRefresh);
    return () => window.removeEventListener("cashier:refresh", onTopRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (orderType === "TABLE") {
      const t = Number(tableNo);
      if (!Number.isInteger(t) || t <= 0) {
        setError("Please select a table.");
        return;
      }
    }
    if (placing) return;

    setPlacing(true);
    try {
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const payload = {
        order_type: orderType,
        table_no: orderType === "TABLE" ? Number(tableNo) : null,
        customer_name: customerName.trim() || "Walk-in",
        customer_phone: customerPhone.trim() || null,
        notes: notes.trim() || null,
        items: cartItems.map((it) => ({
          item_id: it.item_id,
          name: it.name,
          qty: Number(it.qty || 0),
          unit_price: Number(it.unit_price || 0),
        })),
      };

      const res = await fetch("/api/cashier/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to place order.");

      toast.success(
        orderType === "TABLE"
          ? `Table order placed and marked PREPARING.`
          : `Pickup order placed and marked PREPARING.`
      );

      setCart({});
      setNotes("");
      setCustomerPhone("");
      if (orderType === "PICKUP") setCustomerName("Walk-in Pickup");
      window.dispatchEvent(new CustomEvent("cashier:refresh"));
    } catch (e) {
      setError(e?.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_360px] animate-pulse">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-52 rounded bg-slate-100" />
          </div>

          {Array.from({ length: 2 }).map((_, sectionIdx) => (
            <div key={`sec-sk-${sectionIdx}`} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 h-4 w-32 rounded bg-slate-200" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((__, cardIdx) => (
                  <div key={`card-sk-${sectionIdx}-${cardIdx}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="h-32 rounded-xl border border-slate-100 bg-slate-100" />
                    <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-full rounded bg-slate-100" />
                    <div className="mt-1 h-3 w-2/3 rounded bg-slate-100" />
                    <div className="mt-3 flex items-center justify-between">
                      <div className="h-4 w-20 rounded bg-slate-200" />
                      <div className="h-8 w-8 rounded-lg bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="h-10 rounded-xl bg-slate-200" />
            <div className="h-10 rounded-xl bg-slate-100" />
          </div>
          <div className="mt-3 h-10 rounded-xl bg-slate-100" />
          <div className="mt-2 h-10 rounded-xl bg-slate-100" />
          <div className="mt-2 h-20 rounded-xl bg-slate-100" />
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`line-sk-${i}`} className="flex items-center justify-between">
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="h-3 w-14 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 h-11 rounded-xl bg-slate-200" />
        </aside>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
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
                      <div className=" flex items-center justify-between">
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

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShoppingCart className="h-4 w-4" /> Order Cart
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOrderType("TABLE")}
            className={`h-10 rounded-xl border text-sm font-semibold ${orderType === "TABLE" ? "border-emerald-700 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            Table Order
          </button>
          <button
            type="button"
            onClick={() => setOrderType("PICKUP")}
            className={`h-10 rounded-xl border text-sm font-semibold ${orderType === "PICKUP" ? "border-violet-700 bg-violet-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            Pickup
          </button>
        </div>

        {orderType === "TABLE" ? (
          <div className="mt-3">
            <label className="text-xs font-semibold text-slate-600">Select Table</label>
            <select
              value={tableNo}
              onChange={(e) => setTableNo(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Choose table</option>
              {tables.map((t) => (
                <option key={t.table_no} value={t.table_no}>
                  T{t.table_no} {t.label ? `• ${t.label}` : ""}{occupiedTableNos.includes(Number(t.table_no)) ? " • Occupied" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
          />
          <input
            type="text"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-h-[84px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
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

        {error ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        <button
          type="button"
          onClick={placeOrder}
          disabled={placing || cartItems.length === 0}
          className="mt-4 h-11 w-full rounded-xl border border-slate-900 bg-slate-900 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placing ? "Placing..." : "Place Order"}
        </button>
      </aside>
    </div>
  );
}
