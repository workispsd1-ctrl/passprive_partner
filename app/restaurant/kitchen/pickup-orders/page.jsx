"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ChevronDown, Clock, CheckCircle2, AlertCircle } from "lucide-react";

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

export default function PickupOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const seenOrdersRef = useRef(new Set());

  // Get restaurant ID
  useEffect(() => {
    const getRestaurantId = async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user) return;

      const { data: staffData } = await supabaseBrowser
        .from("restaurant_staff")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffData?.restaurant_id) {
        setRestaurantId(staffData.restaurant_id);
      }
    };

    getRestaurantId();
  }, []);

  // Fetch orders
  const fetchOrders = async () => {
    if (!restaurantId) return;

    try {
      setLoading(true);

      const { data: pickupOrders } = await supabaseBrowser
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .neq("status", "delivered")
        .order("created_at", { ascending: false });

      // Check for new orders and play sound
      const newOrders = (pickupOrders || []).filter(
        (o) => !seenOrdersRef.current.has(o.id)
      );
      if (newOrders.length > 0 && seenOrdersRef.current.size > 0) {
        playNotificationSound();
      }

      // Update seen orders
      (pickupOrders || []).forEach((o) => seenOrdersRef.current.add(o.id));

      setOrders(pickupOrders || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    fetchOrders();

    const channel = supabaseBrowser
      .channel("pickup_orders_kitchen")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          setTimeout(() => fetchOrders(), 500);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [restaurantId]);

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      setUpdatingOrderId(orderId);

      await supabaseBrowser
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

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
          <p className="text-gray-600">Loading pickup orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pickup Orders</h1>
        <button
          onClick={() => fetchOrders()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-gray-600">No active pickup orders</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`rounded-lg border ${ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.received}`}
            >
              {/* Order Header */}
              <button
                onClick={() =>
                  setExpandedOrderId(
                    expandedOrderId === order.id ? null : order.id
                  )
                }
                className="w-full px-4 py-3 flex items-center justify-between hover:opacity-75"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-white">
                      Pickup Order
                    </span>
                    {order.customer_name && (
                      <span className="text-sm font-semibold text-gray-700">
                        {order.customer_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    Order #{order.id?.slice(0, 8)} •{" "}
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                <ChevronDown
                  className={`h-5 w-5 text-gray-600 transition ${
                    expandedOrderId === order.id ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Order Details */}
              {expandedOrderId === order.id && (
                <div className="border-t px-4 py-4 space-y-4">
                  {/* Items */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      Items
                    </h3>
                    <div className="space-y-2">
                      {order.items && Array.isArray(order.items) ? (
                        order.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-white"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {item.name || item.item_name}
                              </p>
                              <p className="text-xs text-gray-600">
                                Qty: {item.quantity || 1}
                              </p>
                            </div>
                            <span
                              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                ITEM_STATUS_COLORS[item.status] ||
                                ITEM_STATUS_COLORS.pending
                              }`}
                            >
                              {item.status || "Pending"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-600">
                          No items information
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Order Info */}
                  {order.special_instructions && (
                    <div className="p-3 rounded-lg bg-white border border-yellow-100">
                      <p className="text-xs text-gray-600 mb-1">Special Instructions</p>
                      <p className="text-sm text-gray-900">
                        {order.special_instructions}
                      </p>
                    </div>
                  )}

                  {/* Status Update Buttons */}
                  <div className="flex gap-2 pt-2">
                    {order.status === "received" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "accepted")}
                        disabled={updatingOrderId === order.id}
                        className="flex-1 rounded-lg bg-blue-500 text-white py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
                      >
                        {updatingOrderId === order.id ? "Updating..." : "Start Preparing"}
                      </button>
                    )}

                    {order.status === "accepted" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "preparing")}
                        disabled={updatingOrderId === order.id}
                        className="flex-1 rounded-lg bg-orange-500 text-white py-2 text-sm font-medium hover:bg-orange-600 disabled:opacity-60"
                      >
                        {updatingOrderId === order.id ? "Updating..." : "Mark as Preparing"}
                      </button>
                    )}

                    {(order.status === "preparing" || order.status === "accepted") && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "ready")}
                        disabled={updatingOrderId === order.id}
                        className="flex-1 rounded-lg bg-green-500 text-white py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-60"
                      >
                        {updatingOrderId === order.id ? "Updating..." : "Mark as Ready"}
                      </button>
                    )}

                    {order.status === "ready" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "delivered")}
                        disabled={updatingOrderId === order.id}
                        className="flex-1 rounded-lg bg-gray-500 text-white py-2 text-sm font-medium hover:bg-gray-600 disabled:opacity-60"
                      >
                        {updatingOrderId === order.id ? "Updating..." : "Mark as Delivered"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
