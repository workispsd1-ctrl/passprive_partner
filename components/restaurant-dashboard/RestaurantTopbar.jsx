"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, LogOut, CheckCircle, XCircle, ChevronRight } from "lucide-react";
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

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBookings, setUnreadBookings] = useState([]);

  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const mountedRef = useRef(false);
  const channelRef = useRef(null);
  const bellWrapRef = useRef(null);

  const refetchLockRef = useRef(false);
  const refetchTimerRef = useRef(null);

  const forceRefetch = (rid) => {
    if (!rid) return;
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);

    // throttle burst events into one refetch
    refetchTimerRef.current = setTimeout(async () => {
      if (refetchLockRef.current) return;
      refetchLockRef.current = true;

      await Promise.all([fetchUnreadCount(rid), fetchUnreadBookings(rid)]);

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

  // Load restaurantId
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

  // Realtime subscription (refetch on EVERY event)
  useEffect(() => {
    if (!restaurantId) return;

    // initial
    fetchUnreadCount(restaurantId);
    fetchUnreadBookings(restaurantId);

    if (channelRef.current) {
      supabaseBrowser.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabaseBrowser
      .channel(`restaurant-bookings-unread-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_bookings",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          // ✅ ALWAYS refetch on every change (INSERT/UPDATE/DELETE),
          // so setting read=false later also increases badge immediately.
          forceRefetch(restaurantId);
        }
      )
      .subscribe((status) => {
        console.log("realtime status:", status);
        if (status === "SUBSCRIBED") {
          forceRefetch(restaurantId);
        }
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
    setUnreadCount((c) => Math.max(0, c - 1));

    if (restaurantId) forceRefetch(restaurantId);
  };

  const confirmBooking = async (bookingId) => {
    if (!bookingId) return;
    if (confirmingId) return;

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
    setUnreadCount((c) => Math.max(0, c - 1));

    if (restaurantId) forceRefetch(restaurantId);
  };

  const cancelBooking = async (bookingId) => {
    if (!bookingId) return;
    if (cancellingId) return;

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
    setUnreadCount((c) => Math.max(0, c - 1));

    if (restaurantId) forceRefetch(restaurantId);
  };

  const onClickNotifRow = async (b) => {
    await markRead(b.id);
    setOpen(false);
    router.push("/restaurant/bookings");
  };

  const onBellClick = () => {
    const next = !open;
    setOpen(next);

    if (next && restaurantId) {
      forceRefetch(restaurantId);
    }
  };

  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

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

              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-[380px] rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    New bookings
                  </div>
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

                <div className="max-h-[420px] overflow-auto">
                  {loadingList ? (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">
                      Loading...
                    </div>
                  ) : unreadBookings.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">
                      No new bookings
                    </div>
                  ) : (
                    unreadBookings.map((b) => (
                      <div
                        key={b.id}
                        className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                      >
                        <button
                          type="button"
                          onClick={() => onClickNotifRow(b)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {b.customer_name || "Guest"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {b.customer_phone || "—"}
                                {b.booking_code ? ` • ${b.booking_code}` : ""}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-semibold text-gray-900">
                                {fmtDate(b.booking_date)}
                              </div>
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
                </div>

                {unreadBookings.length > 0 && (
                  <div className="px-4 py-3 bg-white border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push("/restaurant/bookings");
                      }}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                    >
                      Go to bookings
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
