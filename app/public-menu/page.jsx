"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchRestaurantPublicMenuData } from "@/lib/restaurantData";
import { createPublicMenuSession, finalizePublicMenuPayment } from "@/lib/publicMenuPayments";
import { toast } from "sonner";
import {
  Leaf,
  CircleDot,
  BadgeCheck,
  ShoppingCart,
  Minus,
  Plus,
  MapPin,
} from "lucide-react";

const TAX_PERCENT = 15;
const FINALIZE_RETRY_INTERVAL_MS = 3500;
const MAX_FINALIZE_RETRIES = 5;

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
    currency: "MUR",
    maximumFractionDigits: 2,
  }).format(num);
}

function getOrderTimeline(bookingStatusRaw, paymentStatusRaw) {
  const booking = String(bookingStatusRaw || "").toUpperCase();
  const payment = String(paymentStatusRaw || "").toUpperCase();
  const paid = payment === "PAID" || payment === "COMPLETED";
  const orderCompletedByKitchen = booking === "COMPLETED" || paid;
  const served = booking === "SERVED" || orderCompletedByKitchen;
  const preparing = booking === "PREPARING" || served;
  const confirmed = booking === "CONFIRMED" || preparing || booking === "PLACED";
  const placed = Boolean(booking);
  return [
    { key: "PLACED", label: "Order Placed", done: placed },
    { key: "CONFIRMED", label: "Order Confirmed", done: confirmed },
    { key: "PREPARING", label: "Preparing", done: preparing },
    { key: "SERVED", label: "Served", done: served },
    { key: "COMPLETED", label: "Completed", done: paid },
  ];
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeMauritiusPhone(raw) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("230")) return digits.slice(3);
  return digits.slice(-8);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function makeSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function submitGatewayFormToTarget(redirectUrl, method, fields, target) {
  const form = document.createElement("form");
  form.method = String(method || "POST").toUpperCase();
  form.action = redirectUrl;
  form.target = target;
  Object.entries(fields || {}).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value ?? "");
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function getStored(key) {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(key) || "");
}

function storageKey(base, restaurantId, tableNo) {
  const rid = String(restaurantId || "").trim() || "unknown";
  const tbl = String(tableNo || "").trim() || "unknown";
  return `${base}:${rid}:${tbl}`;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = String(searchParams.get("id") || "").trim();
  const tableFromQr = String(searchParams.get("table") || "").trim();
  const returnSessionId = String(searchParams.get("session_id") || "").trim();
  const returnOutcome = String(searchParams.get("outcome") || "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState({ sections: [], full_menu_image_url: null, full_menu_image_urls: [] });

  const [cart, setCart] = useState({});
  const [orderError, setOrderError] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentTrackingId, setPaymentTrackingId] = useState("");
  const [paymentBookingId, setPaymentBookingId] = useState("");
  const [paymentFinalizeError, setPaymentFinalizeError] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeAttempts, setFinalizeAttempts] = useState(0);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const finalizeLockRef = useRef(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [notes, setNotes] = useState("");
  const [enrollLoyalty, setEnrollLoyalty] = useState(false);
  const [orderSessionId, setOrderSessionId] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState("");
  const [orderRecordId, setOrderRecordId] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isStartingBillPayment, setIsStartingBillPayment] = useState(false);
  const [billReady, setBillReady] = useState(false);
  const [activeOrderSnapshot, setActiveOrderSnapshot] = useState(null);
  const reconcileRanRef = useRef(false);
  const clearCurrentOrderState = () => {
    if (typeof window !== "undefined") {
      const tableForKey = tableFromQr || tableNo || "";
      const sessionKey = storageKey("public_menu_order_session_id", restaurantId, tableForKey);
      const recordKey = storageKey("public_menu_order_record_id", restaurantId, tableForKey);
      const cartKey = storageKey("public_menu_order_cart", restaurantId, tableForKey);
      const notesKey = storageKey("public_menu_order_notes", restaurantId, tableForKey);
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(recordKey);
      sessionStorage.removeItem(cartKey);
      sessionStorage.removeItem(notesKey);
    }
    setOrderSessionId("");
    setOrderRecordId("");
    setCart({});
    setNotes("");
    setBillReady(false);
    setActiveOrderSnapshot(null);
  };

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

        const data = await fetchRestaurantPublicMenuData(supabaseBrowser, restaurantId);
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

  useEffect(() => {
    if (!tableFromQr) return;
    setTableNo(onlyDigits(tableFromQr));
  }, [tableFromQr]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tableForKey = tableFromQr || tableNo || "";
    const sessionKey = storageKey("public_menu_order_session_id", restaurantId, tableForKey);
    const recordKey = storageKey("public_menu_order_record_id", restaurantId, tableForKey);
    const cartKey = storageKey("public_menu_order_cart", restaurantId, tableForKey);
    const notesKey = storageKey("public_menu_order_notes", restaurantId, tableForKey);
    const savedSessionId = String(sessionStorage.getItem(sessionKey) || "");
    const savedOrderRecordId = String(sessionStorage.getItem(recordKey) || "");
    const savedCart = String(sessionStorage.getItem(cartKey) || "");
    const savedNotes = String(sessionStorage.getItem(notesKey) || "");
    if (savedSessionId) setOrderSessionId(savedSessionId);
    if (savedOrderRecordId) setOrderRecordId(savedOrderRecordId);
    if (savedNotes) setNotes(savedNotes);
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (parsed && typeof parsed === "object") setCart(parsed);
      } catch {}
    }
  }, [restaurantId, tableFromQr, tableNo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tableForKey = tableFromQr || tableNo || "";
    const sessionKey = storageKey("public_menu_order_session_id", restaurantId, tableForKey);
    const recordKey = storageKey("public_menu_order_record_id", restaurantId, tableForKey);
    const cartKey = storageKey("public_menu_order_cart", restaurantId, tableForKey);
    const notesKey = storageKey("public_menu_order_notes", restaurantId, tableForKey);
    if (orderSessionId) sessionStorage.setItem(sessionKey, orderSessionId);
    if (orderRecordId) sessionStorage.setItem(recordKey, orderRecordId);
    sessionStorage.setItem(cartKey, JSON.stringify(cart || {}));
    sessionStorage.setItem(notesKey, notes || "");
  }, [orderSessionId, orderRecordId, cart, notes, restaurantId, tableFromQr, tableNo]);

  useEffect(() => {
    reconcileRanRef.current = false;
  }, [restaurantId, tableFromQr, tableNo]);

  useEffect(() => {
    if (!restaurantId) return;
    const parsedTableNo = Number(tableFromQr || tableNo);
    if (!Number.isInteger(parsedTableNo) || parsedTableNo <= 0) return;
    if (reconcileRanRef.current) return;
    reconcileRanRef.current = true;

    let cancelled = false;
    const run = async () => {
      try {
        let openOrder = null;
        if (orderSessionId) {
          const bySessionRes = await fetch("/api/public-menu/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "find_open_by_session", session_id: orderSessionId }),
          });
          const bySessionJson = await bySessionRes.json();
          if (bySessionRes.ok && bySessionJson?.ok && bySessionJson?.order?.id) {
            openOrder = bySessionJson.order;
          }
        }

        if (!openOrder) {
          const byTableRes = await fetch("/api/public-menu/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "find_open_by_table",
              restaurant_id: restaurantId,
              table_no: parsedTableNo,
            }),
          });
          const byTableJson = await byTableRes.json();
          if (byTableRes.ok && byTableJson?.ok && byTableJson?.order?.id) {
            openOrder = byTableJson.order;
          }
        }

        if (cancelled) return;

        if (openOrder?.id) {
          let normalizedOpenOrder = openOrder;
          try {
            const fullRes = await fetch("/api/public-menu/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "get_status", order_id: String(openOrder.id || "") }),
            });
            const fullJson = await fullRes.json();
            if (fullRes.ok && fullJson?.ok && fullJson?.order?.id) {
              normalizedOpenOrder = fullJson.order;
            }
          } catch {}

          const openBooking = String(normalizedOpenOrder.booking_status || "").toUpperCase();
          const openPayment = String(normalizedOpenOrder.payment_status || "").toUpperCase();
          const isClosedOrder =
            ["PAID", "COMPLETED"].includes(openPayment) ||
            ["PAID", "CANCELLED"].includes(openBooking);

          if (isClosedOrder) {
            clearCurrentOrderState();
            return;
          }

          const nextId = String(normalizedOpenOrder.id || "");
          const nextSession = String(normalizedOpenOrder.session_id || orderSessionId || "");
          if (nextId && nextId !== orderRecordId) setOrderRecordId(nextId);
          if (nextSession && nextSession !== orderSessionId) setOrderSessionId(nextSession);
          return;
        }

        if (orderRecordId || orderSessionId) {
          clearCurrentOrderState();
        }
      } catch {}
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, tableFromQr, tableNo]);

  useEffect(() => {
    if (!orderRecordId) return;
    let cancelled = false;
    const clearPersistedOrder = () => clearCurrentOrderState();
    const poll = async () => {
      const res = await fetch("/api/public-menu/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_status", order_id: orderRecordId }),
      });
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok || !json?.ok) return;
      if (!json?.order?.id) {
        // stale local pointer; allow next order click to create a fresh row
        setOrderRecordId("");
        setBillReady(false);
        setActiveOrderSnapshot(null);
        return;
      }
      const data = json.order;
      setActiveOrderSnapshot(data || null);
      const status = String(data?.booking_status || "").toUpperCase();
      const paymentStatus = String(data?.payment_status || "").toUpperCase();
      if (paymentStatus === "PAID" || paymentStatus === "COMPLETED") {
        clearPersistedOrder();
        return;
      }
      if (["PAID", "CANCELLED"].includes(status)) {
        clearPersistedOrder();
        return;
      }
      setBillReady(status === "COMPLETED" || status === "PAID");
    };
    poll();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderRecordId, restaurantId, tableFromQr, tableNo]);

  useEffect(() => {
    if (!returnSessionId && !returnOutcome) return;
    setShowPaymentResult(true);
    setPaymentTrackingId(String(searchParams.get("tracking_id") || ""));
    setPaymentStatus(returnOutcome ? returnOutcome.toUpperCase() : "PENDING");
  }, [returnSessionId, returnOutcome, searchParams]);

  const visibleSections = useMemo(
    () =>
      (menu.sections || []).map((s) => ({
        ...s,
        items: (s.items || []).filter((i) => i?.is_available !== false),
      })),
    [menu]
  );

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, it) => sum + Number(it.qty || 0), 0),
    [cartItems]
  );

  const subtotalAmount = useMemo(
    () => cartItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0),
    [cartItems]
  );

  const eligibleDishOffers = useMemo(() => {
    const now = Date.now();
    const offers = Array.isArray(restaurant?.offers) ? restaurant.offers : [];
    return offers.filter((offer) => {
      if (String(offer?.offerKind || "").toUpperCase() !== "DISH") return false;
      if (!offer?.isActive) return false;
      const code = String(offer?.promoCode || "").trim();
      if (!code) return false;
      const startMs = offer?.startDate ? Date.parse(`${offer.startDate}T00:00:00`) : NaN;
      const endMs = offer?.endDate ? Date.parse(`${offer.endDate}T23:59:59`) : NaN;
      if (Number.isFinite(startMs) && now < startMs) return false;
      if (Number.isFinite(endMs) && now > endMs) return false;
      return true;
    });
  }, [restaurant]);

  const promoDiscountAmount = useMemo(() => {
    if (!appliedPromo || !appliedPromo.offerId) return 0;
    const offer = eligibleDishOffers.find((o) => o.id === appliedPromo.offerId);
    if (!offer) return 0;
    const dishId = String(offer?.dishDiscount?.dishId || "");
    const target = cartItems.find((it) => String(it.itemId) === dishId);
    if (!target) return 0;
    const lineTotal = Number(target.price || 0) * Number(target.qty || 0);
    const kind = String(offer.discountType || "").toUpperCase();
    const val = Number(offer.discountValue || 0);
    if (!Number.isFinite(lineTotal) || lineTotal <= 0 || !Number.isFinite(val) || val <= 0) return 0;
    if (kind === "PERCENT") return Number(Math.min(lineTotal, (lineTotal * val) / 100).toFixed(2));
    return Number(Math.min(lineTotal, val).toFixed(2));
  }, [appliedPromo, eligibleDishOffers, cartItems]);

  const eligibleDishOfferOptions = useMemo(() => {
    return eligibleDishOffers
      .map((offer) => {
        const dishId = String(offer?.dishDiscount?.dishId || "");
        const cartLine = cartItems.find((it) => String(it.itemId) === dishId);
        if (!cartLine) return null;
        const lineTotal = Number(cartLine.price || 0) * Number(cartLine.qty || 0);
        const kind = String(offer.discountType || "").toUpperCase();
        const val = Number(offer.discountValue || 0);
        if (!Number.isFinite(lineTotal) || lineTotal <= 0 || !Number.isFinite(val) || val <= 0) return null;
        const discount = kind === "PERCENT" ? Math.min(lineTotal, (lineTotal * val) / 100) : Math.min(lineTotal, val);
        return {
          offerId: offer.id,
          code: String(offer.promoCode || "").toUpperCase(),
          title: offer.title || "Dish Discount",
          dishName: offer?.dishDiscount?.dishName || cartLine.name || "Dish",
          discount: Number(discount.toFixed(2)),
        };
      })
      .filter(Boolean);
  }, [eligibleDishOffers, cartItems]);

  const discountedSubtotalAmount = useMemo(
    () => Number(Math.max(0, subtotalAmount - promoDiscountAmount).toFixed(2)),
    [subtotalAmount, promoDiscountAmount]
  );

  const taxAmount = useMemo(() => (discountedSubtotalAmount * TAX_PERCENT) / 100, [discountedSubtotalAmount]);
  const totalAmount = useMemo(() => discountedSubtotalAmount + taxAmount, [discountedSubtotalAmount, taxAmount]);

  useEffect(() => {
    if (!appliedPromo?.offerId) return;
    const stillValid = promoDiscountAmount > 0;
    if (!stillValid) {
      setAppliedPromo(null);
      setPromoError("Applied promo is no longer eligible for your cart.");
    }
  }, [appliedPromo, promoDiscountAmount]);

  const addToCart = (section, item) => {
    if (billReady) {
      toast.error("Order is completed. Please proceed to bill payment.");
      return;
    }
    if (!orderSessionId) setOrderSessionId(makeSessionId());
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
    if (billReady) return;
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
    setAppliedPromo(null);
    setPromoError("");
  };

  const placeOrder = async () => {
    setOrderError("");

    const trimmedRestaurantId = String(restaurantId || "").trim();
    const parsedTableNo = Number(tableNo);
    const roundedSubtotal = Number(discountedSubtotalAmount.toFixed(2));
    const roundedTax = Number(taxAmount.toFixed(2));
    const roundedTotal = Number(totalAmount.toFixed(2));
    const recomputedSubtotal = Number(
      (cartItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0) - promoDiscountAmount).toFixed(2)
    );
    const trimmedName = customerName.trim();
    const normalizedPhone = normalizeMauritiusPhone(customerPhone);

    if (cartItems.length === 0) {
      setOrderError("Your cart is empty.");
      return;
    }
    if (!isUuidLike(trimmedRestaurantId)) {
      setOrderError("Invalid restaurant id.");
      return;
    }
    if (!Number.isInteger(parsedTableNo) || parsedTableNo <= 0) {
      setOrderError("Table number is required.");
      return;
    }
    if (enrollLoyalty) {
      if (!trimmedName) {
        setOrderError("Name is required for loyalty enrollment.");
        return;
      }
      if (!normalizedPhone || normalizedPhone.length !== 8) {
        setOrderError("Enter phone number for loyalty enrollment.");
        return;
      }
    }
    if (Math.abs(recomputedSubtotal - roundedSubtotal) > 0.01) {
      setOrderError("Cart total mismatch. Please refresh and try again.");
      return;
    }
    if (Math.abs(roundedSubtotal + roundedTax - roundedTotal) > 0.01) {
      setOrderError("Total mismatch. Please refresh and try again.");
      return;
    }

    if (isPlacingOrder) return;
    setIsPlacingOrder(true);

    try {
      let nextTargetOrderId = String(orderRecordId || "").trim();
      let sessionIdForOrder = orderSessionId || makeSessionId();

      // Final guard: never append items to a paid/closed order.
      if (nextTargetOrderId) {
        try {
          const currentRes = await fetch("/api/public-menu/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_status", order_id: nextTargetOrderId }),
          });
          const currentJson = await currentRes.json();
          const currentOrder = currentRes.ok && currentJson?.ok ? currentJson?.order : null;
          const currentBooking = String(currentOrder?.booking_status || "").toUpperCase();
          const currentPayment = String(currentOrder?.payment_status || "").toUpperCase();
          const isClosed =
            ["PAID", "COMPLETED"].includes(currentPayment) ||
            ["PAID", "CANCELLED"].includes(currentBooking);
          if (isClosed || !currentOrder?.id) {
            const tableForKey = tableFromQr || tableNo || "";
            const sessionKey = storageKey("public_menu_order_session_id", restaurantId, tableForKey);
            const recordKey = storageKey("public_menu_order_record_id", restaurantId, tableForKey);
            sessionStorage.removeItem(sessionKey);
            sessionStorage.removeItem(recordKey);
            nextTargetOrderId = "";
            sessionIdForOrder = makeSessionId();
            setOrderRecordId("");
            setOrderSessionId(sessionIdForOrder);
            setBillReady(false);
            setActiveOrderSnapshot(null);
          }
        } catch {}
      }

      if (!orderSessionId || !nextTargetOrderId) {
        sessionIdForOrder = sessionIdForOrder || makeSessionId();
        setOrderSessionId(sessionIdForOrder);
      }
      const commonPayload = {
        session_id: sessionIdForOrder,
        restaurant_id: trimmedRestaurantId,
        table_no: parsedTableNo,
        customer_name: enrollLoyalty ? trimmedName : "Guest",
        customer_phone: enrollLoyalty ? normalizedPhone : "",
        order_items: cartItems.map((it) => ({
          item_id: it.itemId,
          name: it.name,
          qty: Number(it.qty || 0),
          unit_price: Number(Number(it.price || 0).toFixed(2)),
          line_total: Number((Number(it.price || 0) * Number(it.qty || 0)).toFixed(2)),
        })),
        order_details: {
          session_id: sessionIdForOrder,
          promo_code: appliedPromo?.code || null,
          loyalty_enrolled: Boolean(enrollLoyalty),
        },
        subtotal_amount: roundedSubtotal,
        tax_amount: roundedTax,
        total_amount: roundedTotal,
        notes: notes.trim() || null,
        payment_method: "IVERI",
        payment_status: "PENDING",
        source: "public_menu",
      };

      const upsertRes = await fetch("/api/public-menu/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          target_order_id: nextTargetOrderId || null,
          payload: commonPayload,
          bill_ready: billReady,
        }),
      });
      const upsertJson = await upsertRes.json();
      if (!upsertRes.ok || !upsertJson?.ok) throw new Error(upsertJson?.error || "Failed to save order.");
      const savedOrderId = String(upsertJson?.order_id || orderRecordId || "");
      if (savedOrderId && savedOrderId !== orderRecordId) setOrderRecordId(savedOrderId);
      if (savedOrderId) {
        const statusRes = await fetch("/api/public-menu/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_status", order_id: savedOrderId }),
        });
        const statusJson = await statusRes.json();
        if (statusRes.ok && statusJson?.ok && statusJson?.order?.id) {
          const latestOrder = statusJson.order;
          setActiveOrderSnapshot(latestOrder);
          const latestStatus = String(latestOrder?.booking_status || "").toUpperCase();
          setBillReady(latestStatus === "COMPLETED" || latestStatus === "PAID");
        }
      }

      toast.success("Order updated. You can keep adding items.");

      // Reset local batch after successful submit so next additions are continuation deltas.
      setCart({});
      setAppliedPromo(null);
      setPromoError("");
    } catch (e) {
      setOrderError(e?.message || "Unable to save order. Please try again.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const startBillPayment = async (mode) => {
    if (!billReady) {
      setOrderError("Payment is available once partner marks order as completed.");
      return;
    }
    if (isStartingBillPayment) return;

    const orderId = String(activeOrderSnapshot?.id || orderRecordId || "").trim();
    const parsedTableNo = Number(tableNo);
    const trimmedRestaurantId = String(restaurantId || "").trim();
    const orderItems = Array.isArray(activeOrderSnapshot?.order_items) ? activeOrderSnapshot.order_items : [];

    if (!orderId || !trimmedRestaurantId || !Number.isInteger(parsedTableNo) || parsedTableNo <= 0) {
      setOrderError("Unable to start payment. Missing order details.");
      return;
    }

    setIsStartingBillPayment(true);
    setOrderError("");

    try {
      if (mode === "TABLE") {
        const markCashRes = await fetch("/api/public-menu/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_cash", order_id: orderId }),
        });
        const markCashJson = await markCashRes.json();
        if (!markCashRes.ok || !markCashJson?.ok) {
          throw new Error(markCashJson?.error || "Failed to mark counter payment.");
        }
        setPaymentStatus("PAY_AT_COUNTER");
        setPaymentFinalizeError("");
        setShowPaymentResult(true);
        setActiveOrderSnapshot((prev) =>
          prev && typeof prev === "object"
            ? { ...prev, payment_method: "CASH", payment_status: "PENDING" }
            : prev
        );
        toast.success("Counter payment selected. Partner will mark this as paid.");
        return;
      }

      const subtotal = Number(activeOrderSnapshot?.subtotal_amount || 0);
      const tax = Number(activeOrderSnapshot?.tax_amount || 0);
      const total = Number(activeOrderSnapshot?.total_amount || 0);
      const customerName = String(activeOrderSnapshot?.customer_name || "Guest");
      const customerPhone = String(activeOrderSnapshot?.customer_phone || "");
      const orderNotes = String(activeOrderSnapshot?.notes || notes || "");

      const payload = {
        restaurant_id: trimmedRestaurantId,
        table_no: parsedTableNo,
        customer_name: customerName,
        customer_phone: customerPhone,
        notes: [orderNotes, `OrderRecord:${orderId}`].filter(Boolean).join(" | "),
        items: orderItems.map((it) => ({
          item_id: String(it?.item_id || it?.id || it?.name || ""),
          name: String(it?.name || "Item"),
          qty: Number(it?.qty || 0),
          unit_price: Number(Number(it?.unit_price || 0).toFixed(2)),
        })),
        subtotal_amount: Number(subtotal.toFixed(2)),
        tax_amount: Number(tax.toFixed(2)),
        total_amount: Number(total.toFixed(2)),
        currency_code: "MUR",
      };

      const data = await createPublicMenuSession(payload);
      const sessionId = String(data?.payment_session_id || "");
      const trackingId = String(data?.tracking_id || "");
      const redirectUrl = String(data?.redirect_url || "");
      const method = String(data?.payload?.method || "POST");
      const fields = data?.payload?.fields || {};

      if (!sessionId || !trackingId || !redirectUrl || typeof fields !== "object") {
        throw new Error("Invalid payment gateway response.");
      }

      sessionStorage.setItem("public_menu_payment_session_id", sessionId);
      sessionStorage.setItem("public_menu_tracking_id", trackingId);
      sessionStorage.setItem("public_menu_restaurant_id", trimmedRestaurantId);
      sessionStorage.setItem("public_menu_table_no", String(parsedTableNo));

      setPaymentStatus("PENDING");
      setPaymentFinalizeError("");
      submitGatewayFormToTarget(redirectUrl, method, fields, "_self");
    } catch (e) {
      setOrderError(e?.message || "Unable to start payment. Please try again.");
    } finally {
      setIsStartingBillPayment(false);
    }
  };

  const finalizePayment = async ({ autoRetry = false } = {}) => {
    if (finalizeLockRef.current) return;
    finalizeLockRef.current = true;
    setIsFinalizing(true);
    setPaymentFinalizeError("");

    const scheduleRetry = () => {
      if (autoRetry && finalizeAttempts < MAX_FINALIZE_RETRIES) {
        setFinalizeAttempts((n) => n + 1);
        setTimeout(() => {
          finalizeLockRef.current = false;
          finalizePayment({ autoRetry: true });
        }, FINALIZE_RETRY_INTERVAL_MS);
      }
    };

    try {
      const storedSessionId = getStored("public_menu_payment_session_id");
      const storedTrackingId = getStored("public_menu_tracking_id");
      const primaryPayload = returnSessionId || storedSessionId
        ? { payment_session_id: returnSessionId || storedSessionId }
        : { tracking_id: storedTrackingId };

      let data = null;
      try {
        data = await finalizePublicMenuPayment(primaryPayload);
      } catch (firstErr) {
        const msg = String(firstErr?.message || "");
        const canFallbackToTracking =
          Boolean(storedTrackingId) &&
          Object.prototype.hasOwnProperty.call(primaryPayload, "payment_session_id");
        if (canFallbackToTracking) {
          data = await finalizePublicMenuPayment({ tracking_id: storedTrackingId });
        } else {
          throw firstErr;
        }
        if (!data && msg) throw firstErr;
      }
      const nextStatus = String(data?.status || "").toUpperCase();
      const nextTrackingId = String(data?.tracking_id || storedTrackingId || "");
      const nextBookingId = String(data?.table_booking_id || "");

      setPaymentStatus(nextStatus || "PENDING");
      setPaymentTrackingId(nextTrackingId);
      setPaymentBookingId(nextBookingId);

      if (nextStatus === "FINALIZED" || nextStatus === "ALREADY_FINALIZED") {
        toast.success("Order confirmed");
        setCart({});
        setNotes("");
        setOrderSessionId("");
        setOrderRecordId("");
        setBillReady(false);
        setActiveOrderSnapshot(null);
        setShowPaymentResult(true);
        const tableForKey = tableFromQr || tableNo || "";
        const sessionKey = storageKey("public_menu_order_session_id", restaurantId, tableForKey);
        const recordKey = storageKey("public_menu_order_record_id", restaurantId, tableForKey);
        const cartKey = storageKey("public_menu_order_cart", restaurantId, tableForKey);
        const notesKey = storageKey("public_menu_order_notes", restaurantId, tableForKey);
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem(recordKey);
        sessionStorage.removeItem(cartKey);
        sessionStorage.removeItem(notesKey);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("session_id");
        params.delete("outcome");
        const qs = params.toString();
        router.replace(qs ? `/public-menu?${qs}` : "/public-menu");
        return;
      }

      scheduleRetry();
    } catch (e) {
      const msg = String(e?.message || "Unable to verify payment yet.");
      if (msg.toUpperCase().includes("PENDING")) {
        setPaymentStatus("PENDING");
        setPaymentFinalizeError("Payment is still pending verification. Retrying...");
        scheduleRetry();
      } else {
        setPaymentFinalizeError(msg);
        scheduleRetry();
      }
    } finally {
      setIsFinalizing(false);
      finalizeLockRef.current = false;
    }
  };

  useEffect(() => {
    if (!returnSessionId && !returnOutcome) return;
    const shouldAutoRetry = !["failed", "fail", "error"].includes(returnOutcome);
    finalizePayment({ autoRetry: shouldAutoRetry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnSessionId, returnOutcome]);

  useEffect(() => {
    if (!returnSessionId && !returnOutcome) return;
    const base = `/public-menu?id=${encodeURIComponent(restaurantId)}&table=${encodeURIComponent(tableFromQr || tableNo || "")}`;
    window.history.pushState({ publicMenuSafe: true }, "", window.location.href);
    const onPop = () => {
      window.history.replaceState({ publicMenuSafe: true }, "", base);
      router.replace(base);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [returnSessionId, returnOutcome, restaurantId, tableFromQr, tableNo, router]);

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
        </div>

        {showPaymentResult ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sticky top-2 z-30 sm:static sm:z-auto">
            <div className="text-sm sm:text-base font-semibold text-emerald-800">
              {paymentStatus === "PAY_AT_TABLE" || paymentStatus === "PAY_AT_COUNTER"
                ? "Order completed. Please pay at the counter."
                : paymentStatus === "FINALIZED" || paymentStatus === "SUCCESS"
                ? "Payment successful. Your order is placed."
                : "We are verifying your payment."}
            </div>
            <div className="mt-2 text-xs text-emerald-900 space-y-1">
              <div>Tracking ID: {paymentTrackingId || "—"}</div>
              <div>Booking ID: {paymentBookingId || "—"}</div>
            </div>
            {paymentFinalizeError ? <div className="mt-2 text-xs text-rose-700">{paymentFinalizeError}</div> : null}
            <div className="mt-3 flex items-center gap-2">
              {paymentStatus !== "FINALIZED" ? (
                <button
                  type="button"
                  onClick={() => finalizePayment({ autoRetry: true })}
                  disabled={isFinalizing}
                  className="rounded-lg bg-[#DA3224] text-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  {isFinalizing ? "Verifying..." : "Check Payment Status"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {orderError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {orderError}
          </div>
        ) : null}
        {activeOrderSnapshot?.id ? (
          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-sm font-semibold text-sky-900">Your current order</div>
            <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="relative flex items-start justify-between">
                    {getOrderTimeline(activeOrderSnapshot?.booking_status, activeOrderSnapshot?.payment_status).map((step, idx, arr) => (
                      <div key={step.key} className="relative flex flex-1 flex-col items-center">
                        <div
                          className={`z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[11px] font-bold ${
                            step.done
                              ? "border-emerald-600 bg-emerald-500 text-white"
                              : "border-slate-300 bg-white text-slate-500"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className={`mt-2 text-center text-[11px] font-semibold ${step.done ? "text-emerald-800" : "text-slate-500"}`}>
                          {step.label}
                        </div>
                        {idx < arr.length - 1 ? (
                          <div
                            className={`absolute top-4 left-1/2 h-[3px] w-full ${
                              step.done ? "bg-emerald-400" : "bg-slate-200"
                            }`}
                            style={{ transform: "translateX(16px)" }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {(Array.isArray(activeOrderSnapshot.order_items) ? activeOrderSnapshot.order_items : []).map((it, idx) => (
                <div key={`${it?.item_id || it?.name || "item"}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-sky-900">
                  <span className="truncate">{it?.name || "Item"} x {Number(it?.qty || 0)}</span>
                  <span>{money(Number(it?.line_total || Number(it?.qty || 0) * Number(it?.unit_price || 0)))}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs font-semibold text-sky-900">
              Running total: {money(activeOrderSnapshot?.total_amount || 0)}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs text-sky-900">
              <div>Subtotal: {money(activeOrderSnapshot?.subtotal_amount || 0)}</div>
              <div>Tax: {money(activeOrderSnapshot?.tax_amount || 0)}</div>
              <div className="font-semibold">Total: {money(activeOrderSnapshot?.total_amount || 0)}</div>
            </div>
            {billReady ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-900">Bill summary</div>
                <div className="mt-1 text-xs text-slate-600">Your order is completed. Choose payment mode.</div>
                
                {["PAID", "COMPLETED"].includes(String(activeOrderSnapshot?.payment_status || "").toUpperCase()) ? (
                  <div className="mt-3 text-xs font-semibold text-emerald-700">Payment already completed for this order.</div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startBillPayment("ONLINE")}
                      disabled={isStartingBillPayment}
                      className="rounded-lg bg-[#DA3224] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {isStartingBillPayment ? "Processing..." : "Pay"}
                    </button>
                    <span className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      Pay in Counter
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

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

      {cartCount > 0 && !billReady ? (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {cartCount} item{cartCount > 1 ? "s" : ""} • {money(totalAmount)}
                </div>
                <div className="text-[11px] text-slate-500">
                Subtotal {money(discountedSubtotalAmount)} + Tax {money(taxAmount)}
                </div>
              </div>
            <button
              type="button"
              onClick={placeOrder}
              disabled={isPlacingOrder || cartItems.length === 0}
              className="rounded-lg bg-[#DA3224] text-white px-3.5 py-2 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              {isPlacingOrder ? "Ordering..." : "Order"}
            </button>
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
