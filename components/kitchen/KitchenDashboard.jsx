"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ChevronDown, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const TABLE_BOOKING_STATUS_MAP = {
  PLACED: "received",
  CONFIRMED: "accepted",
  PREPARING: "preparing",
  SERVED: "completed",
  COMPLETED: "completed",
  PAID: "completed",
  CANCELLED: "completed",
};

const TABLE_BOOKING_NEXT_STATUS = {
  received: "PREPARING",
  accepted: "PREPARING",
  preparing: "SERVED",
  ready: "SERVED",
  delivered: "COMPLETED",
};

const PICKUP_ORDER_STATUS_MAP = {
  NEW: "received",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY_FOR_PICKUP: "ready",
  PICKED_UP: "delivered",
  CANCELLED: "delivered",
};

const PICKUP_ORDER_NEXT_STATUS = {
  received: "ACCEPTED",
  accepted: "PREPARING",
  preparing: "READY_FOR_PICKUP",
  ready: "PICKED_UP",
  delivered: "PICKED_UP",
};

const ORDER_STATUS_COLORS = {
  received: "bg-yellow-50 border-yellow-200",
  accepted: "bg-blue-50 border-blue-200",
  preparing: "bg-orange-50 border-orange-200",
  completed: "bg-green-50 border-green-200",
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

function normalizePickupOrderStatus(status) {
  const upper = String(status || "NEW").toUpperCase();
  return PICKUP_ORDER_STATUS_MAP[upper] || "received";
}

function mapPickupOrder(order) {
  const items = toDisplayItems(order?.items || order?.order_items);
  const instructions = order?.notes || order?.metadata?.notes || "";

  return {
    ...order,
    id: order.id,
    customer_name: order.customer_name,
    status: normalizePickupOrderStatus(order?.order_status),
    order_status: String(order?.order_status || "NEW").toUpperCase(),
    items,
    special_instructions: instructions,
    total_amount: order.total_amount,
  };
}

function getPickupOrderNextStatus(localStatus) {
  return PICKUP_ORDER_NEXT_STATUS[localStatus] || "PICKED_UP";
}

function mapTableBooking(order) {
  const bookingStatus = String(order?.booking_status || "PLACED").toUpperCase();
  const items = toDisplayItems(order?.order_items);
  const instructions =
    order?.notes ||
    order?.order_details?.special_instructions ||
    order?.order_details?.notes ||
    "";

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

function getTableBookingNextStatus(localStatus) {
  return TABLE_BOOKING_NEXT_STATUS[localStatus] || "COMPLETED";
}

export default function KitchenDashboard() {
  const [tableOrders, setTableOrders] = useState([]);
  const [pickupOrders, setPickupOrders] = useState([]);
  const [orderAlert, setOrderAlert] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const seenOrdersRef = useRef(new Set());
  const tableStatusByIdRef = useRef(new Map());
  const hasHydratedOrdersRef = useRef(false);

  // Get restaurant ID
  useEffect(() => {
    const getRestaurantId = async () => {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) return;

      const response = await fetch("/api/kitchen/restaurant", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (response.ok && payload?.ok && payload?.restaurant?.id) {
        setRestaurantId(payload.restaurant.id);
      }
    };

    getRestaurantId();
  }, []);

  // Fetch orders
  const fetchOrders = async () => {
    if (!restaurantId) return;

    try {
      setLoading(true);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) return;

      const tableResponse = await fetch("/api/kitchen/table-bookings", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const tablePayload = await tableResponse.json();

      if (!tableResponse.ok || !tablePayload?.ok) {
        console.error("Error fetching table bookings:", tablePayload?.error || tableResponse.statusText);
        return;
      }

      // Fetch pickup orders via server API
      const pickupResp = await fetch("/api/kitchen/pickup-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pickupPayload = await pickupResp.json();
      if (!pickupResp.ok || !pickupPayload?.ok) {
        console.error("Error fetching pickup orders:", pickupPayload?.error || pickupResp.statusText);
      }
      const pickupOrdersData = pickupPayload?.orders || [];

      // Check for new orders and play sound
      const normalizedTableOrders = (tablePayload?.orders || [])
        .filter((order) => isActiveTableBooking(order?.booking_status))
        .map(mapTableBooking);
      const normalizedPickupOrders = (pickupOrdersData || []).map(mapPickupOrder);

      const notifyCandidates = [];
      if (hasHydratedOrdersRef.current) {
        normalizedTableOrders.forEach((order) => {
          const id = String(order.id);
          const status = String(order.status || "").toLowerCase();
          const previousStatus = tableStatusByIdRef.current.get(id);
          const isNewTableOrder = !seenOrdersRef.current.has(`table:${id}`);
          const becameReceived = previousStatus && previousStatus !== "received" && status === "received";

          if (status === "received" && (isNewTableOrder || becameReceived)) {
            notifyCandidates.push(order);
          }
        });

        normalizedPickupOrders.forEach((order) => {
          const id = String(order.id);
          const status = String(order.status || "").toLowerCase();
          const isNewPickupOrder = !seenOrdersRef.current.has(`pickup:${id}`);

          if (status === "received" && isNewPickupOrder) {
            notifyCandidates.push(order);
          }
        });
      }

      if (notifyCandidates.length > 0) {
        playOrderSound();
        const first = notifyCandidates[0];
        setOrderAlert({
          id: String(first.id),
          message: first.table_number ? `New order received for table ${first.table_number}` : `New pickup order received`,
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

      normalizedTableOrders.forEach((order) => {
        seenOrdersRef.current.add(`table:${order.id}`);
      });
      normalizedPickupOrders.forEach((order) => {
        seenOrdersRef.current.add(`pickup:${order.id}`);
      });
      tableStatusByIdRef.current = new Map(
        normalizedTableOrders.map((order) => [String(order.id), String(order.status || "").toLowerCase()])
      );
      hasHydratedOrdersRef.current = true;

      setTableOrders(normalizedTableOrders);
      setPickupOrders(normalizedPickupOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    // Initial fetch
    fetchOrders();

    const interval = setInterval(() => {
      fetchOrders();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [restaurantId]);

  // Maps local display status → valid DB booking_status value for table bookings
  const LOCAL_TO_DB_TABLE_STATUS = {
    received: "PLACED",
    accepted: "PREPARING",
    preparing: "PREPARING",
    ready: "COMPLETED",
    delivered: "COMPLETED",
    completed: "COMPLETED",
    // Already uppercase DB values pass through
    PLACED: "PLACED",
    CONFIRMED: "CONFIRMED",
    PREPARING: "PREPARING",
    SERVED: "SERVED",
    COMPLETED: "COMPLETED",
    PAID: "PAID",
    CANCELLED: "CANCELLED",
  };

  const handleStatusUpdate = async (orderId, orderType, bookingStatus) => {
    try {
      setUpdatingOrderId(orderId);

      if (orderType === "table") {
        // Translate any local display status to a valid DB booking_status
        const dbStatus =
          LOCAL_TO_DB_TABLE_STATUS[bookingStatus] ||
          String(bookingStatus).toUpperCase();

        // Optimistic UI update
        setTableOrders((prev) =>
          prev.map((o) =>
            String(o.id) === String(orderId)
              ? {
                ...o,
                booking_status: dbStatus,
                status: normalizeTableBookingStatus(dbStatus),
              }
              : o
          )
        );

        // Use the server API (service-role) to bypass RLS
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          console.error("No auth token available for status update");
          return;
        }

        const resp = await fetch("/api/kitchen/table-bookings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ booking_id: orderId, booking_status: dbStatus }),
        });

        const result = await resp.json();
        if (!resp.ok || !result.ok) {
          console.error("Error updating table booking status:", result.error);
          // Revert optimistic update on failure
          await fetchOrders();
          return;
        }
      } else {
        // For pickup orders, convert local display status to server order_status
        const nextOrderStatus = getPickupOrderNextStatus(bookingStatus);

        setPickupOrders((prev) =>
          prev.map((o) =>
            String(o.id) === String(orderId)
              ? {
                ...o,
                order_status: nextOrderStatus,
                status: normalizePickupOrderStatus(nextOrderStatus),
              }
              : o
          )
        );

        const { error: pickupErr } = await supabaseBrowser
          .from("restaurant_orders")
          .update({ order_status: nextOrderStatus })
          .eq("id", orderId);

        if (pickupErr) {
          console.error("Error updating pickup order status:", pickupErr);
        }
      }

      // Refresh from server to ensure canonical state
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
      completed: { icon: CheckCircle2, label: "Completed" },
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

  const renderOrderCard = (order, orderType) => (
    <div
      key={order.id}
      className={`rounded-lg border ${ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.received}`}
    >
      {/* Order Header */}
      <button
        onClick={() =>
          setExpandedOrderId(expandedOrderId === order.id ? null : order.id)
        }
        className="w-full px-4 py-3 flex items-center justify-between hover:opacity-75"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-white">
              {orderType === "table" ? "Table Order" : "Pickup Order"}
            </span>
            {order.status === "received" && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-600 text-white">
                NEW
              </span>
            )}
            {orderType === "table" && order.table_number && (
              <span className="text-sm font-semibold text-gray-700">
                Table {order.table_number}
              </span>
            )}
            {orderType === "pickup" && order.customer_name && (
              <span className="text-sm font-semibold text-gray-700">
                {order.customer_name}
              </span>
            )}
            {orderType === "table" && order.customer_name && (
              <span className="text-sm font-semibold text-gray-700">
                {order.customer_name}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600">
            Order #{order.id?.slice(0, 8)} • {getStatusBadge(order.status)}
          </div>
        </div>

        <ChevronDown
          className={`h-5 w-5 text-gray-600 transition ${expandedOrderId === order.id ? "rotate-180" : ""
            }`}
        />
      </button>

      {/* Order Details */}
      {expandedOrderId === order.id && (
        <div className="border-t px-4 py-4 space-y-4">
          {/* Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Items</h3>
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
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${ITEM_STATUS_COLORS[item.status] ||
                        ITEM_STATUS_COLORS.pending
                        }`}
                    >
                      {item.status || "Pending"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-600">No items information</p>
              )}
            </div>
          </div>

          {/* Order Info */}
          {order.special_instructions && (
            <div className="p-3 rounded-lg bg-white border border-yellow-100">
              <p className="text-xs text-gray-600 mb-1">Special Instructions</p>
              <p className="text-sm text-gray-900">{order.special_instructions}</p>
            </div>
          )}

          {/* Status Update Buttons — only shown for table orders in this card view */}
          {orderType === "table" && (
            <div className="flex gap-2 pt-2">
              {(order.status === "received" || order.status === "accepted") && (
                <button
                  onClick={() =>
                    handleStatusUpdate(order.id, "table", "PREPARING")
                  }
                  disabled={updatingOrderId === order.id}
                  className="flex-1 rounded-lg bg-blue-500 text-white py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
                >
                  {updatingOrderId === order.id ? "Updating..." : "Mark Preparing"}
                </button>
              )}

              {(order.status === "preparing" || order.status === "accepted" || order.status === "received") && (
                <button
                  onClick={() =>
                    handleStatusUpdate(order.id, "table", "COMPLETED")
                  }
                  disabled={updatingOrderId === order.id}
                  className="flex-1 rounded-lg bg-green-500 text-white py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-60"
                >
                  {updatingOrderId === order.id ? "Updating..." : "Mark Completed"}
                </button>
              )}
            </div>
          )}
          {orderType === "pickup" && (
            <div className="flex gap-2 pt-2">
              {(order.status === "received" || order.status === "accepted") && (
                <button
                  onClick={() =>
                    handleStatusUpdate(order.id, "pickup", order.status === "received" ? "received" : "accepted")
                  }
                  disabled={updatingOrderId === order.id}
                  className="flex-1 rounded-lg bg-blue-500 text-white py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
                >
                  {updatingOrderId === order.id ? "Updating..." : "Advance Status"}
                </button>
              )}
              {(order.status === "preparing" || order.status === "ready") && (
                <button
                  onClick={() =>
                    handleStatusUpdate(order.id, "pickup", order.status)
                  }
                  disabled={updatingOrderId === order.id}
                  className="flex-1 rounded-lg bg-green-500 text-white py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-60"
                >
                  {updatingOrderId === order.id ? "Updating..." : order.status === "preparing" ? "Mark Ready" : "Mark Delivered"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (loading && tableOrders.length === 0 && pickupOrders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-12 w-12 rounded-lg bg-purple-100 mx-auto mb-3" />
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <h1 className="text-2xl font-bold text-gray-900">Kitchen Orders</h1>
        <button
          onClick={() => fetchOrders()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Table Orders Section */}
        <div className="flex flex-col h-[calc(100vh-200px)]">
          <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-t-lg bg-gradient-to-r from-purple-50 to-purple-100 border-b-2 border-purple-300">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              🍽️ Table Orders
              {tableOrders.length > 0 && (
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-purple-600 text-white">
                  {tableOrders.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => fetchOrders()}
              className="text-xs font-medium text-purple-600 hover:text-purple-700"
            >
              ⟳
            </button>
          </div>

          {tableOrders.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-b-lg border border-dashed border-gray-300 bg-gray-50">
              <p className="text-gray-600">No active table orders</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-b-lg border border-gray-200 bg-white space-y-2 p-3">
              {tableOrders.map((order) => (
                <div
                  key={order.id}
                  className={`w-full rounded-lg border-2 p-3 text-left transition ${expandedOrderId === order.id
                      ? ORDER_STATUS_COLORS[order.status] + " border-purple-500"
                      : ORDER_STATUS_COLORS[order.status]
                    }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrderId(
                        expandedOrderId === order.id ? null : order.id
                      )
                    }
                    className="w-full flex items-center justify-between mb-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-white">
                        Table {order.table_number || "-"}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {getStatusBadge(order.status)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      #{order.id?.slice(0, 6)}
                    </span>
                  </button>

                  {order.items && Array.isArray(order.items) && (
                    <div className="text-xs text-gray-700 mb-2">
                      <p className="font-medium">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </p>
                      <p className="truncate text-gray-600">
                        {order.items.map((i) => i.name || i.item_name).join(", ")}
                      </p>
                    </div>
                  )}

                  {expandedOrderId === order.id && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      {order.items && Array.isArray(order.items) && (
                        <div>
                          <p className="text-xs font-semibold text-gray-900 mb-1">
                            Items:
                          </p>
                          <div className="space-y-1">
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs bg-gray-50 p-1.5 rounded"
                              >
                                <span className="font-medium">
                                  {item.name || item.item_name}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-600">
                                    Qty: {item.quantity || 1}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ITEM_STATUS_COLORS[item.status] ||
                                      ITEM_STATUS_COLORS.pending
                                      }`}
                                  >
                                    {item.status || "Pending"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {order.special_instructions && (
                        <div className="text-xs bg-yellow-50 border border-yellow-200 p-1.5 rounded">
                          <p className="font-semibold text-gray-900">
                            {order.special_instructions}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-1 pt-2 flex-wrap">
                        {order.status === "received" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusUpdate(order.id, "table", "PREPARING");
                            }}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 text-xs rounded bg-blue-500 text-white py-1 font-medium hover:bg-blue-600 disabled:opacity-60"
                          >
                            Mark Preparing
                          </button>
                        )}

                        {(order.status === "preparing" || order.status === "accepted" || order.status === "received") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusUpdate(order.id, "table", "COMPLETED");
                            }}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 text-xs rounded bg-green-500 text-white py-1 font-medium hover:bg-green-600 disabled:opacity-60"
                          >
                            Mark Completed
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

        {/* Pickup Orders Section */}
        <div className="flex flex-col h-[calc(100vh-200px)]">
          <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-t-lg bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-300">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              📦 Pickup Orders
              {pickupOrders.length > 0 && (
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white">
                  {pickupOrders.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => fetchOrders()}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              ⟳
            </button>
          </div>

          {pickupOrders.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-b-lg border border-dashed border-gray-300 bg-gray-50">
              <p className="text-gray-600">No active pickup orders</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-b-lg border border-gray-200 bg-white space-y-2 p-3">
              {pickupOrders.map((order) => (
                <div
                  key={order.id}
                  className={`w-full rounded-lg border-2 p-3 text-left transition ${expandedOrderId === order.id
                      ? ORDER_STATUS_COLORS[order.status] + " border-blue-500"
                      : ORDER_STATUS_COLORS[order.status]
                    }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrderId(
                        expandedOrderId === order.id ? null : order.id
                      )
                    }
                    className="w-full flex items-center justify-between mb-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-white">
                        {order.customer_name || "Pickup"}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {getStatusBadge(order.status)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      #{order.id?.slice(0, 6)}
                    </span>
                  </button>

                  {order.items && Array.isArray(order.items) && (
                    <div className="text-xs text-gray-700 mb-2">
                      <p className="font-medium">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </p>
                      <p className="truncate text-gray-600">
                        {order.items.map((i) => i.name || i.item_name).join(", ")}
                      </p>
                    </div>
                  )}

                  {expandedOrderId === order.id && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      {order.items && Array.isArray(order.items) && (
                        <div>
                          <p className="text-xs font-semibold text-gray-900 mb-1">
                            Items:
                          </p>
                          <div className="space-y-1">
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs bg-gray-50 p-1.5 rounded"
                              >
                                <span className="font-medium">
                                  {item.name || item.item_name}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-600">
                                    Qty: {item.quantity || 1}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ITEM_STATUS_COLORS[item.status] ||
                                      ITEM_STATUS_COLORS.pending
                                      }`}
                                  >
                                    {item.status || "Pending"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {order.special_instructions && (
                        <div className="text-xs bg-yellow-50 border border-yellow-200 p-1.5 rounded">
                          <p className="font-semibold text-gray-900">
                            {order.special_instructions}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-1 pt-2 flex-wrap">
                        {order.status === "received" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusUpdate(order.id, "pickup", "accepted");
                            }}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 text-xs rounded bg-blue-500 text-white py-1 font-medium hover:bg-blue-600 disabled:opacity-60"
                          >
                            Mark Preparing
                          </button>
                        )}

                        {(order.status === "accepted" ||
                          order.status === "received") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusUpdate(order.id, "pickup", "ready");
                              }}
                              disabled={updatingOrderId === order.id}
                              className="flex-1 text-xs rounded bg-green-500 text-white py-1 font-medium hover:bg-green-600 disabled:opacity-60"
                            >
                              Mark Completed
                            </button>
                          )}

                        {order.status === "ready" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusUpdate(
                                order.id,
                                "pickup",
                                "delivered"
                              );
                            }}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 text-xs rounded bg-gray-500 text-white py-1 font-medium hover:bg-gray-600 disabled:opacity-60"
                          >
                            Mark Completed
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
      </div>
    </div>
  );
}
