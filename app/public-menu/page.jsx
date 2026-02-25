"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Leaf,
  CircleDot,
  BadgeCheck,
  ShoppingCart,
  Minus,
  Plus,
  X,
  MapPin,
  Trash2,
} from "lucide-react";

const TAX_PERCENT = 15;

function getMenuImageUrls(menuObj) {
  if (!menuObj || typeof menuObj !== "object") return [];
  const urls = [];

  if (Array.isArray(menuObj.full_menu_image_urls)) urls.push(...menuObj.full_menu_image_urls);
  if (typeof menuObj.full_menu_image_url === "string" && menuObj.full_menu_image_url) {
    urls.push(menuObj.full_menu_image_url);
  }

  return Array.from(new Set(urls.map((u) => String(u || "").trim()).filter(Boolean)));
}

function safeMenu(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sections: [], full_menu_image_url: null, full_menu_image_urls: [] };
  }

  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const fullMenuImages = getMenuImageUrls(raw);

  return {
    ...raw,
    full_menu_image_url: fullMenuImages[0] || null,
    full_menu_image_urls: fullMenuImages,
    sections,
  };
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num);
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-5 space-y-4 animate-pulse">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="mt-2 h-4 w-36 rounded bg-slate-100" />
        </div>
        <div className="h-24 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-96 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

function PublicRestaurantMenuContent() {
  const searchParams = useSearchParams();
  const restaurantId = String(searchParams.get("id") || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState({ sections: [], full_menu_image_url: null, full_menu_image_urls: [] });

  const [cart, setCart] = useState({});
  const [openOrderModal, setOpenOrderModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        if (!restaurantId) {
          setError("Invalid restaurant id.");
          setLoading(false);
          return;
        }

        const { data, error: qErr } = await supabaseBrowser
          .from("restaurants")
          .select("id,name,city,area,menu,is_active")
          .eq("id", restaurantId)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!data) {
          setError("Restaurant not found.");
          setLoading(false);
          return;
        }

        if (!cancelled) {
          setRestaurant(data);
          setMenu(safeMenu(data.menu));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load menu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const visibleSections = useMemo(
    () =>
      (menu.sections || []).map((s) => ({
        ...s,
        items: (s.items || []).filter((i) => i?.is_available !== false),
      })),
    [menu]
  );

  const fullMenuImages = useMemo(() => getMenuImageUrls(menu), [menu]);
  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, it) => sum + Number(it.qty || 0), 0),
    [cartItems]
  );

  const subtotalAmount = useMemo(
    () => cartItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0),
    [cartItems]
  );

  const taxAmount = useMemo(() => (subtotalAmount * TAX_PERCENT) / 100, [subtotalAmount]);
  const totalAmount = useMemo(() => subtotalAmount + taxAmount, [subtotalAmount, taxAmount]);

  const addToCart = (section, item) => {
    setOrderSuccess("");
    setCart((prev) => {
      const existing = prev[item.id];
      const qty = Number(existing?.qty || 0) + 1;
      return {
        ...prev,
        [item.id]: {
          itemId: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          qty,
          sectionId: section.id || "",
          sectionName: section.name || "",
        },
      };
    });
  };

  const removeOneFromCart = (itemId) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      const nextQty = Number(existing.qty || 0) - 1;
      if (nextQty <= 0) {
        const clone = { ...prev };
        delete clone[itemId];
        return clone;
      }
      return { ...prev, [itemId]: { ...existing, qty: nextQty } };
    });
  };

  const clearCart = () => {
    setCart({});
    setOrderError("");
  };

  const placeOrder = async () => {
    setOrderError("");
    setOrderSuccess("");

    if (cartItems.length === 0) {
      setOrderError("Your cart is empty.");
      return;
    }

    setPlacingOrder(true);

    const payload = {
      restaurant_id: restaurantId,
      customer_name: customerName.trim() || "Guest",
      customer_phone: customerPhone.trim() || "N/A",
      table_no: tableNo.trim() || null,
      notes: notes.trim() || null,
      items: cartItems.map((it) => ({
        item_id: it.itemId,
        name: it.name,
        price: it.price,
        qty: it.qty,
        section_id: it.sectionId,
        section_name: it.sectionName,
        line_total: Number(it.price || 0) * Number(it.qty || 0),
      })),
      subtotal_amount: Number(subtotalAmount.toFixed(2)),
      tax_percent: TAX_PERCENT,
      tax_amount: Number(taxAmount.toFixed(2)),
      total_amount: Number(totalAmount.toFixed(2)),
      currency: "INR",
      status: "PLACED",
      source: "PUBLIC_MENU",
    };

    const { error: insErr } = await supabaseBrowser.from("restaurant_table_orders").insert(payload);

    setPlacingOrder(false);

    if (insErr) {
      setOrderError(insErr.message || "Unable to place order right now.");
      return;
    }

    setCart({});
    setOpenOrderModal(false);
    setTableNo("");
    setNotes("");
    setOrderSuccess("Order placed successfully.");
  };

  if (loading) return <MenuSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="mx-auto max-w-5xl px-3 sm:px-5 py-4 sm:py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{restaurant?.name || "Menu"}</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-xs sm:text-sm text-slate-600">
            <MapPin className="h-4 w-4" />
            {[restaurant?.area, restaurant?.city].filter(Boolean).join(", ")}
          </p>
          <p className="mt-2 text-xs text-slate-500">Tap + to add dishes to your cart.</p>
          {orderSuccess ? <p className="mt-2 text-sm font-medium text-emerald-700">{orderSuccess}</p> : null}
        </div>

        {visibleSections.length > 0 ? (
          <div className="mt-4 overflow-x-auto no-scrollbar">
            <div className="flex gap-2 w-max pb-1">
              {visibleSections.map((section) => (
                <a
                  key={`tab-${section.id}`}
                  href={`#section-${section.id}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap"
                >
                  {section.name}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {fullMenuImages.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <div className="text-sm sm:text-base font-semibold text-slate-900">Menu Images</div>
            <div className="text-xs text-slate-500 mt-1">Swipe to view full menu photos.</div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {fullMenuImages.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="Full menu"
                  className="h-40 w-28 sm:h-52 sm:w-36 rounded-xl border border-slate-200 object-cover bg-slate-100 shrink-0"
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {visibleSections.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Menu is not available yet.
            </div>
          ) : (
            visibleSections.map((section) => (
              <div
                id={`section-${section.id}`}
                key={section.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="text-base sm:text-lg font-semibold text-slate-900">{section.name}</div>
                  {section.description ? <div className="text-xs sm:text-sm text-slate-500 mt-1">{section.description}</div> : null}
                </div>

                <div className="p-3 space-y-2">
                  {(section.items || []).length === 0 ? (
                    <div className="text-sm text-slate-500">No available items.</div>
                  ) : (
                    section.items.map((item) => {
                      const img = Array.isArray(item.image_urls) ? item.image_urls[0] : null;
                      const qty = Number(cart[item.id]?.qty || 0);

                      return (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3">
                          <div className="flex gap-2.5 sm:gap-3">
                            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shrink-0">
                              {img ? (
                                <img src={img} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full grid place-items-center text-[10px] text-slate-400">No image</div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <div className="text-sm font-semibold text-slate-900 truncate">{item.name}</div>
                                {item.is_bestseller ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                    <BadgeCheck className="h-3 w-3" />
                                    Best
                                  </span>
                                ) : null}
                                {item.is_veg ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    <Leaf className="h-3 w-3" />
                                    Veg
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                    <CircleDot className="h-3 w-3 fill-rose-600 text-rose-600" />
                                    Non-veg
                                  </span>
                                )}
                              </div>

                              {item.description ? (
                                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{item.description}</p>
                              ) : null}

                              <div className="mt-2 flex items-center justify-between">
                                <div className="text-sm sm:text-base font-bold text-slate-900">{money(item.price)}</div>

                                {qty > 0 ? (
                                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-1.5 py-1">
                                    <button
                                      type="button"
                                      onClick={() => removeOneFromCart(item.id)}
                                      className="h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                                    >
                                      <Minus className="h-3.5 w-3.5 text-slate-700" />
                                    </button>
                                    <span className="min-w-[16px] text-center text-sm font-semibold text-slate-900">{qty}</span>
                                    <button
                                      type="button"
                                      onClick={() => addToCart(section, item)}
                                      className="h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                                    >
                                      <Plus className="h-3.5 w-3.5 text-slate-700" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => addToCart(section, item)}
                                    className="h-8 rounded-lg bg-[#DA3224] px-3 text-xs font-semibold text-white hover:opacity-90 inline-flex items-center gap-1"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {cartCount > 0 ? (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {cartCount} item{cartCount > 1 ? "s" : ""} • {money(totalAmount)}
              </div>
              <div className="text-[11px] text-slate-500">
                Subtotal {money(subtotalAmount)} + Tax {money(taxAmount)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOrderError("");
                setOpenOrderModal(true);
              }}
              className="rounded-lg bg-[#DA3224] text-white px-3.5 py-2 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              View Cart
            </button>
          </div>
        </div>
      ) : null}

      {openOrderModal ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !placingOrder && setOpenOrderModal(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-2 sm:p-4">
            <div className="w-full sm:max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Your Order</div>
                <button
                  type="button"
                  onClick={() => !placingOrder && setOpenOrderModal(false)}
                  className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-slate-700" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3">
                {cartItems.map((it) => (
                  <div key={it.itemId} className="rounded-lg border border-slate-200 p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{it.name}</div>
                      <div className="text-[11px] text-slate-500">{it.sectionName}</div>
                      <div className="text-xs text-slate-700 mt-1">
                        {money(it.price)} x {it.qty} = {money(it.price * it.qty)}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => removeOneFromCart(it.itemId)}
                        className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[14px] text-center text-sm font-semibold">{it.qty}</span>
                      <button
                        type="button"
                        onClick={() =>
                          addToCart(
                            { id: it.sectionId, name: it.sectionName },
                            { id: it.itemId, name: it.name, price: it.price }
                          )
                        }
                        className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {cartItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear cart
                  </button>
                ) : null}

                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium text-slate-900">{money(subtotalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tax ({TAX_PERCENT}%)</span>
                    <span className="font-medium text-slate-900">{money(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-semibold text-slate-900">{money(totalAmount)}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-2.5 bg-slate-50">
                  <div>
                    <label className="text-[11px] text-slate-600">Name (optional)</label>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none bg-white"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">Phone (optional)</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={15}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(onlyDigits(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none bg-white"
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">Table No</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={tableNo}
                      onChange={(e) => setTableNo(onlyDigits(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none bg-white"
                      placeholder="e.g. 12"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none bg-white"
                      placeholder="No onion, less spicy..."
                    />
                  </div>
                </div>

                {orderError ? <div className="text-sm text-rose-600">{orderError}</div> : null}
              </div>

              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Total: {money(totalAmount)}</div>
                <button
                  type="button"
                  disabled={placingOrder || cartItems.length === 0}
                  onClick={placeOrder}
                  className="rounded-lg bg-[#DA3224] text-white px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {placingOrder ? "Placing..." : "Place Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PublicRestaurantMenuPage() {
  return (
    <Suspense fallback={<MenuSkeleton />}>
      <PublicRestaurantMenuContent />
    </Suspense>
  );
}
