"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Clock, CheckCircle2, AlertCircle, X } from "lucide-react";

const ORDER_STATUS_COLORS = {
  received: "bg-yellow-50 border-yellow-200",
  accepted: "bg-blue-50 border-blue-200",
  preparing: "bg-orange-50 border-orange-200",
  ready: "bg-green-50 border-green-200",
  delivered: "bg-gray-50 border-gray-200",
};

const ITEM_STATUS_COLORS = {
  pending: "bg-gray-100 text-gray-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
};

const TABLE_BOOKING_STATUS_MAP = {
  PLACED: "received",
  CONFIRMED: "accepted",
  PREPARING: "preparing",
  SERVED: "ready",
  COMPLETED: "delivered",
  PAID: "delivered",
  CANCELLED: "delivered",
};

function playNotificationSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

function playOrderSound() {
  try {
    const a = new Audio("/sounds/new-order.wav");
    a.volume = 0.9;
    a.play().catch(() => {
      playNotificationSound();
    });
  } catch (err) {
    playNotificationSound();
  }
}

function normalizeTableBookingStatus(status) {
  const upper = String(status || "PLACED").toUpperCase();
  return TABLE_BOOKING_STATUS_MAP[upper] || "received";
}

function isActiveTableBooking(bookingStatus) {
  const upper = String(bookingStatus || "PLACED").toUpperCase();
  return !["COMPLETED", "PAID", "CANCELLED"].includes(upper);
}

function toDisplayItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    ...item,
    name: item?.name || item?.item_name || item?.title || "Item",
    item_name: item?.item_name || item?.name || item?.title || "Item",
    quantity: item?.quantity ?? item?.qty ?? 1,
    status: String(item?.status || "pending").toLowerCase(),
  }));
}

function mapTableBooking(order) {
  const bookingStatus = String(order?.booking_status || "PLACED").toUpperCase();
  const items = toDisplayItems(order?.order_items);
  const instructions =
    order?.notes || order?.order_details?.special_instructions || order?.order_details?.notes || "";

  return {
    ...order,
    id: order.id,
    table_number: order.table_no,
    customer_name: order.customer_name,
    status: normalizeTableBookingStatus(bookingStatus),
    booking_status: bookingStatus,
    items,
    special_instructions: instructions,
  };
}

export default function TableOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [orderAlert, setOrderAlert] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const seenOrdersRef = useRef(new Set());
  const tableStatusByIdRef = useRef(new Map());
  const hasHydratedOrdersRef = useRef(false);
  const selectedOrder = selectedOrderId
    ? orders.find((order) => String(order.id) === String(selectedOrderId)) || null
    : null;

  // Get restaurant ID via server endpoint to avoid RLS issues
  useEffect(() => {
    const getRestaurantId = async () => {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      try {
        const res = await fetch("/api/kitchen/restaurant", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (res.ok && payload?.ok && payload?.restaurant?.id) {
          setRestaurantId(payload.restaurant.id);
        }
      } catch (err) {
        console.error("Error resolving restaurant:", err);
      }
    };

    getRestaurantId();
  }, []);

  // Fetch orders (use server API for table bookings)
  const fetchOrders = async () => {
    if (!restaurantId) return;

    try {
      setLoading(true);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const tableRes = await fetch("/api/kitchen/table-bookings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tablePayload = await tableRes.json();
      if (!tableRes.ok || !tablePayload?.ok) {
        console.error("Error fetching table bookings:", tablePayload?.error || tableRes.statusText);
        setOrders([]);
        return;
      }

      const normalized = (tablePayload.orders || [])
        .filter((o) => isActiveTableBooking(o?.booking_status))
        .map(mapTableBooking);

      const notifyCandidates = [];
      if (hasHydratedOrdersRef.current) {
        normalized.forEach((order) => {
          const id = String(order.id);
          const status = String(order.status || "").toLowerCase();
          const previousStatus = tableStatusByIdRef.current.get(id);
          const isNewTableOrder = !seenOrdersRef.current.has(id);
          const becameReceived = previousStatus && previousStatus !== "received" && status === "received";

          if (status === "received" && (isNewTableOrder || becameReceived)) {
            notifyCandidates.push(order);
          }
        });
      }

      if (notifyCandidates.length > 0) {
        playOrderSound();
        const first = notifyCandidates[0];
        setOrderAlert({
          id: String(first.id),
          message: first.table_number ? `New order received for table ${first.table_number}` : `New order received`,
          tableNo: first.table_number || "—",
          customerName: first.customer_name || "Guest",
          totalAmount: Number(first.total_amount || 0),
          items: Array.isArray(first.items)
            ? first.items.map((item) => ({
                name: item?.name || item?.item_name || "Item",
                quantity: Number(item?.quantity ?? item?.qty ?? 1),
              }))
            : [],
        });
      }

      normalized.forEach((o) => seenOrdersRef.current.add(o.id));
      tableStatusByIdRef.current = new Map(
        normalized.map((order) => [String(order.id), String(order.status || "").toLowerCase()])
      );
      hasHydratedOrdersRef.current = true;

      setOrders(normalized);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    fetchOrders();

    const interval = setInterval(() => {
      fetchOrders();
    }, 5000);

    return () => clearInterval(interval);
  }, [restaurantId]);

  const handleStatusUpdate = async (orderId, bookingStatus) => {
    try {
      setUpdatingOrderId(orderId);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const resp = await fetch("/api/kitchen/table-bookings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_id: orderId, booking_status: bookingStatus }),
      });

      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        console.error("Error updating table booking status:", result.error || "Failed");
      }

      if (["COMPLETED", "PAID", "CANCELLED"].includes(String(bookingStatus).toUpperCase())) {
        setSelectedOrderId(null);
      }

      await fetchOrders();
    } catch (error) {
      console.error("Error updating order status:", error);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      received: { icon: AlertCircle, label: "Received" },
      accepted: { icon: Clock, label: "Preparing" },
      preparing: { icon: Clock, label: "Preparing" },
      ready: { icon: CheckCircle2, label: "Ready" },
      delivered: { icon: CheckCircle2, label: "Delivered" },
    };

    const config = statusMap[status] || { icon: AlertCircle, label: "Unknown" };
    const Icon = config.icon;

    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-4 w-4" />
        {config.label}
      </span>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-12 w-12 rounded-lg bg-purple-100 mx-auto mb-3" />
          <p className="text-gray-600">Loading table orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {orderAlert ? (
        <div className="fixed right-6 top-20 z-50 w-72 rounded-lg border bg-[#F4E7D1] p-3 shadow-2xl">
          <div className="text-sm font-semibold text-slate-900">{orderAlert.message}</div>
          <div className="mt-2 text-xs text-slate-700 space-y-1">
            <div>Table: {orderAlert.tableNo}</div>
            <div>Customer: {orderAlert.customerName}</div>
            <div>Amount: {orderAlert.totalAmount}</div>
          </div>
          {Array.isArray(orderAlert.items) && orderAlert.items.length > 0 ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-900">Items</div>
              <div className="mt-1 max-h-24 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                {orderAlert.items.map((item, idx) => (
                  <div key={`${orderAlert.id}-${idx}`} className="flex items-center justify-between text-xs text-slate-700">
                    <span className="truncate pr-2">{item.name}</span>
                    <span className="font-semibold">x{item.quantity || 1}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOrderAlert(null)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Table Orders</h1>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-gray-600">No active table orders</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className={`w-full rounded-lg border p-4 text-left transition hover:shadow ${ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.received}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {order.table_number && (
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-white text-gray-900">
                        Table {order.table_number}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-700">{getStatusBadge(order.status)}</span>
                  </div>
                  <div className="text-gray-900 text-sm font-semibold">
                    {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-gray-700 line-clamp-1 mt-0.5">
                    {order.items?.map((i) => i.name || i.item_name).join(", ") || "No items"}
                  </div>
                </div>
                <div className="text-xs text-gray-600">#{order.id?.slice(0, 6)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#771FA8]/20 bg-[#F4E7D1] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#771FA8]/20 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Table {selectedOrder.table_number || "-"} Order</h3>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
              >
                <X className="h-4 w-4 text-gray-700" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm text-gray-800">
              <p><span className="font-semibold">Customer:</span> {selectedOrder.customer_name || "Guest"}</p>
              <p><span className="font-semibold">Order:</span> #{String(selectedOrder.id).slice(0, 8)}</p>

              <div className="pt-1">
                <div className="font-semibold text-gray-900 mb-1">Items</div>
                <div className="rounded-xl border border-gray-200 bg-white max-h-48 overflow-auto">
                  {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                    selectedOrder.items.map((it, idx) => (
                      <div
                        key={`${selectedOrder.id}-${idx}`}
                        className="px-3 py-2 text-xs border-b last:border-b-0 border-gray-100 flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-gray-900">{it.name || it.item_name}</span>
                        <span className="text-gray-700">Qty: {it.quantity || 1}</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-gray-500">No item details.</div>
                  )}
                </div>
              </div>

              {selectedOrder.special_instructions ? (
                <div className="p-3 rounded-lg bg-white border border-yellow-100">
                  <p className="text-xs text-gray-600 mb-1">Special Instructions</p>
                  <p className="text-sm text-gray-900">{selectedOrder.special_instructions}</p>
                </div>
              ) : null}
            </div>

            <div className="px-5 py-4 border-t border-[#771FA8]/20 bg-white flex gap-2">
              <button
                type="button"
                onClick={() => handleStatusUpdate(selectedOrder.id, "PREPARING")}
                disabled={updatingOrderId === selectedOrder.id}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60"
              >
                {updatingOrderId === selectedOrder.id ? "Updating..." : "Mark Preparing"}
              </button>

            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
