"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  LogOut,
  CheckCircle,
  XCircle,
  ChevronRight,
  PackageCheck,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TITLE_MAP = {
  "/restaurant/dashboard": "Dashboard",
  "/restaurant/bookings": "Bookings",
  "/restaurant/menu": "Menu",
  "/restaurant/offers": "Offers",
  "/restaurant/reviews": "Reviews",
  "/restaurant/analytics": "Analytics",
  "/restaurant/payouts": "Payouts",
  "/restaurant/settings": "Settings",
  "/restaurant/orders": "Orders",
};

function getTitleFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "Dashboard";
  const base = `/${parts[0]}/${parts[1]}`;
  return TITLE_MAP[base] || "Dashboard";
}

function fmtDate(d) {
  if (!d) return "—";
  return String(d);
}
function fmtTime(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

export default function RestaurantTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const title = useMemo(() => getTitleFromPath(pathname), [pathname]);

  const [restaurantId, setRestaurantId] = useState(null);

  const [unreadCount, setUnreadCount] = useState(null);
  const [unreadBookings, setUnreadBookings] = useState([]);

  const [unreadOrders, setUnreadOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const [acceptingOrderId, setAcceptingOrderId] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);

  const mountedRef = useRef(false);
  const channelRef = useRef(null);
  const bellWrapRef = useRef(null);

  const refetchLockRef = useRef(false);
  const refetchTimerRef = useRef(null);

  const forceRefetch = (rid) => {
    if (!rid) return;
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);

    refetchTimerRef.current = setTimeout(async () => {
      if (refetchLockRef.current) return;
      refetchLockRef.current = true;

      await Promise.all([fetchUnreadCount(rid), fetchUnreadBookings(rid), fetchUnreadOrders(rid)]);

      refetchLockRef.current = false;
    }, 80);
  };

  useEffect(() => {
    mountedRef.current = true;

    const onDocMouseDown = (e) => {
      if (!open) return;
      const el = bellWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("mousedown", onDocMouseDown);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (channelRef.current) supabaseBrowser.removeChannel(channelRef.current);
    };
  }, [open]);

  useEffect(() => {
    let isMounted = true;

    const loadRestaurantId = async () => {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();

      if (!user) return;

      const { data: userRow } = await supabaseBrowser
        .from("users")
        .select("id, role")
        .eq("id", user.id)
        .single();

      if (!userRow || userRow.role !== "restaurantpartner") return;

      const { data: restaurant } = await supabaseBrowser
        .from("restaurants")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();

      if (isMounted && restaurant?.id) {
        setRestaurantId(restaurant.id);
      }
    };

    loadRestaurantId();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchUnreadCount = async (rid) => {
    if (!rid) return;

    const { count, error } = await supabaseBrowser
      .from("restaurant_bookings")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", rid)
      .eq("status", "pending")
      .eq("read", false);

    if (error) {
      console.log("fetchUnreadCount error:", error);
      return;
    }

    if (!mountedRef.current) return;
    setUnreadCount(count || 0);
  };

  const fetchUnreadBookings = async (rid) => {
    if (!rid) return;

    setLoadingList(true);

    const { data, error } = await supabaseBrowser
      .from("restaurant_bookings")
      .select(
        `
        id,
        customer_name,
        customer_phone,
        booking_date,
        booking_time,
        party_size,
        booking_code,
        status,
        read,
        created_at
      `
      )
      .eq("restaurant_id", rid)
      .eq("status", "pending")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.log("fetchUnreadBookings error:", error);
      if (mountedRef.current) setLoadingList(false);
      return;
    }

    if (!mountedRef.current) return;
    setUnreadBookings(data || []);
    setLoadingList(false);
  };

  const fetchUnreadOrders = async (rid) => {
    if (!rid) return;

    setLoadingOrders(true);

    const { data, error } = await supabaseBrowser
      .from("restaurant_orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        total_amount,
        order_status,
        payment_status,
        pickup_code,
        pickup_eta,
        created_at
      `
      )
      .eq("restaurant_id", rid)
      .eq("order_status", "NEW")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.log("fetchUnreadOrders error:", error);
      if (mountedRef.current) setLoadingOrders(false);
      return;
    }

    if (!mountedRef.current) return;
    setUnreadOrders(data || []);
    setLoadingOrders(false);
  };

  useEffect(() => {
    if (!restaurantId) return;

    forceRefetch(restaurantId);

    if (channelRef.current) {
      supabaseBrowser.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabaseBrowser
      .channel(`restaurant-notifications-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_bookings",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => forceRefetch(restaurantId)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => forceRefetch(restaurantId)
      )
      .subscribe((status) => {
        console.log("realtime status:", status);
        if (status === "SUBSCRIBED") forceRefetch(restaurantId);
      });

    channelRef.current = channel;

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const markRead = async (bookingId) => {
    const { error } = await supabaseBrowser
      .from("restaurant_bookings")
      .update({
        read: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) {
      console.log("markRead error:", error);
      return;
    }

    setUnreadBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setUnreadCount((c) => {
      const curr = typeof c === "number" ? c : 0;
      return Math.max(0, curr - 1);
    });

    if (restaurantId) forceRefetch(restaurantId);
  };

  const confirmBooking = async (bookingId) => {
    if (!bookingId || confirmingId) return;
    setConfirmingId(bookingId);

    const { error } = await supabaseBrowser
      .from("restaurant_bookings")
      .update({
        status: "confirmed",
        read: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    setConfirmingId(null);

    if (error) {
      console.log("confirmBooking error:", error);
      return;
    }

    setUnreadBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setUnreadCount((c) => {
      const curr = typeof c === "number" ? c : 0;
      return Math.max(0, curr - 1);
    });

    if (restaurantId) forceRefetch(restaurantId);
  };

  const cancelBooking = async (bookingId) => {
    if (!bookingId || cancellingId) return;
    setCancellingId(bookingId);

    const { error } = await supabaseBrowser
      .from("restaurant_bookings")
      .update({
        status: "cancelled",
        read: true,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    setCancellingId(null);

    if (error) {
      console.log("cancelBooking error:", error);
      return;
    }

    setUnreadBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setUnreadCount((c) => {
      const curr = typeof c === "number" ? c : 0;
      return Math.max(0, curr - 1);
    });

    if (restaurantId) forceRefetch(restaurantId);
  };

  const acceptOrder = async (orderId) => {
    if (!orderId || acceptingOrderId) return;
    setAcceptingOrderId(orderId);

    const { error } = await supabaseBrowser
      .from("restaurant_orders")
      .update({
        order_status: "ACCEPTED",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    setAcceptingOrderId(null);

    if (error) {
      console.log("acceptOrder error:", error);
      return;
    }

    setUnreadOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (restaurantId) forceRefetch(restaurantId);
  };

  const cancelOrder = async (orderId) => {
    if (!orderId || cancellingOrderId) return;
    setCancellingOrderId(orderId);

    const { error } = await supabaseBrowser
      .from("restaurant_orders")
      .update({
        order_status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    setCancellingOrderId(null);

    if (error) {
      console.log("cancelOrder error:", error);
      return;
    }

    setUnreadOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (restaurantId) forceRefetch(restaurantId);
  };

  const onClickNotifRow = async (b) => {
    await markRead(b.id);
    setOpen(false);
    router.push("/restaurant/bookings");
  };

  const onClickOrderRow = (o) => {
    setOpen(false);
    router.push("/restaurant/orders");
  };

  const onBellClick = () => {
    const next = !open;
    setOpen(next);

    if (next && restaurantId) forceRefetch(restaurantId);
  };

  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

  const totalUnread =
    (typeof unreadCount === "number" ? unreadCount : 0) + (unreadOrders?.length || 0);

  const showBadge = totalUnread > 0;

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="font-bold text-gray-900 text-xl">{title}</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={bellWrapRef}>
            <button
              className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 relative"
              type="button"
              onClick={onBellClick}
            >
              <Bell className="h-4 w-4 text-gray-700" />
              {showBadge && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center leading-none">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-[420px] rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Notifications</div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/restaurant/bookings");
                    }}
                    className="text-xs font-semibold text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
                  >
                    View all <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[460px] overflow-auto">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                    New bookings
                  </div>

                  {loadingList ? (
                    <div className="px-4 py-4 text-sm text-gray-500">Loading bookings...</div>
                  ) : unreadBookings.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-500">No new bookings</div>
                  ) : (
                    unreadBookings.map((b) => (
                      <div key={b.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <button type="button" onClick={() => onClickNotifRow(b)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{b.customer_name || "Guest"}</div>
                              <div className="text-xs text-gray-500">
                                {b.customer_phone || "—"}
                                {b.booking_code ? ` • ${b.booking_code}` : ""}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-semibold text-gray-900">{fmtDate(b.booking_date)}</div>
                              <div className="text-xs text-gray-500">
                                {fmtTime(b.booking_time)} • {b.party_size} guests
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmBooking(b.id);
                            }}
                            disabled={confirmingId === b.id}
                            className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {confirmingId === b.id ? "Confirming..." : "Confirm"}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelBooking(b.id);
                            }}
                            disabled={cancellingId === b.id}
                            className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border-red-200 hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {cancellingId === b.id ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-y border-gray-100">
                    New orders
                  </div>

                  {loadingOrders ? (
                    <div className="px-4 py-4 text-sm text-gray-500">Loading orders...</div>
                  ) : unreadOrders.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-500">No new orders</div>
                  ) : (
                    unreadOrders.map((o) => (
                      <div key={o.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <button type="button" onClick={() => onClickOrderRow(o)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {o.order_number || "Order"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {o.customer_name || "Customer"} • {o.customer_phone || "—"}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-semibold text-gray-900">
                                ₹{Number(o.total_amount || 0)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {o.pickup_code ? `Code: ${o.pickup_code}` : "Pickup"}
                              </div>
                            </div>
                          </div>
                        </button>

                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptOrder(o.id);
                            }}
                            disabled={acceptingOrderId === o.id}
                            className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            {acceptingOrderId === o.id ? "Accepting..." : "Accept"}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelOrder(o.id);
                            }}
                            disabled={cancellingOrderId === o.id}
                            className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border-red-200 hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {cancellingOrderId === o.id ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {(unreadBookings.length > 0 || unreadOrders.length > 0) && (
                  <div className="px-4 py-3 bg-white border-t border-gray-100 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push("/restaurant/bookings");
                      }}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                    >
                      Go to bookings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push("/restaurant/orders");
                      }}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                    >
                      Go to orders
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-medium hover:bg-red-400 cursor-pointer flex items-center gap-2 bg-red-500 text-white"
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
