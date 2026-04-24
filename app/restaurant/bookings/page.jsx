"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Users,
  CheckCircle,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const PAGE_SIZE = 10;
const BOOKING_SELECT_FIELDS = `
  id,
  restaurant_id,
  customer_user_id,
  customer_name,
  customer_phone,
  customer_email,
  booking_date,
  booking_time,
  duration_minutes,
  party_size,
  status,
  source,
  special_request,
  notes_internal,
  booking_code,
  cancelled_at,
  cancel_reason,
  read,
  customer_booking_number,
  created_at,
  updated_at
`;

function normalizeBookingStatus(status) {
  const normalized = String(status || "").toLowerCase();

  return normalized;
}

function getBookingStatusLabel(status) {
  const normalized = normalizeBookingStatus(status);

  const labels = {
    pending: "Pending",
    payment_successful: "Paid",
    payment_successfull: "Paid",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No show",
  };

  return labels[normalized] || (status ? String(status) : "—");
}

function isPendingStatus(status) {
  return normalizeBookingStatus(status) === "pending";
}

function needsRestaurantDecision(status) {
  const normalized = normalizeBookingStatus(status);
  return normalized === "pending" || normalized === "payment_successful" || normalized === "payment_successfull";
}

function isPaidStatus(status) {
  const normalized = normalizeBookingStatus(status);
  return normalized === "payment_successful" || normalized === "payment_successfull";
}

function canConfirmBooking(status, isRestaurantVisible) {
  return Boolean(isRestaurantVisible) && isPaidStatus(status);
}

function formatBookingDate(value) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

function formatBookingTime(value) {
  if (!value) return "—";
  const base = String(value).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(base)) return String(value);
  return base;
}

function formatBookingDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export default function RestaurantBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [restaurantId, setRestaurantId] = useState(null);
  const [isRestaurantVisible, setIsRestaurantVisible] = useState(true);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeBooking, setActiveBooking] = useState(null);

  const channelRef = useRef(null);
  const debounceRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) supabaseBrowser.removeChannel(channelRef.current);
    };
  }, []);

  useEffect(() => {
    loadRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRestaurant = async () => {
    const {
      data: { user },
    } = await supabaseBrowser.auth.getUser();

    if (!user) return;

    const { data: userRow } = await supabaseBrowser
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (userRow?.role !== "restaurantpartner") return;

    const { data: restaurant } = await supabaseBrowser
      .from("restaurants")
      .select("id, is_active")
      .eq("owner_user_id", user.id)
      .single();

    if (restaurant?.id) {
      setRestaurantId(restaurant.id);
      setIsRestaurantVisible(Boolean(restaurant.is_active));
    }
  };

  useEffect(() => {
    if (restaurantId) fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, status, page, search]);

  const fetchBookings = async () => {
    if (!restaurantId) return;
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseBrowser
      .from("restaurant_bookings")
      .select(BOOKING_SELECT_FIELDS, { count: "exact" })
      .eq("restaurant_id", restaurantId)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .range(from, to);

    if (status === "paid") {
      query = query.in("status", ["payment_successful", "payment_successfull"]);
    } else if (status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,booking_code.ilike.%${search}%`
      );
    }

    const { data, count } = await query;

    if (!mountedRef.current) return;

    setBookings(data || []);
    setTotal(count || 0);
    setLoading(false);

    if (activeBooking?.id && data?.length) {
      const fresh = data.find((x) => x.id === activeBooking.id);
      if (fresh) setActiveBooking(fresh);
    }
  };

  const debouncedRefetch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchBookings();
    }, 150);
  };

  useEffect(() => {
    if (!restaurantId) return;

    if (channelRef.current) {
      supabaseBrowser.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabaseBrowser
      .channel(`restaurant-bookings-page-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_bookings",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          debouncedRefetch();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, status, page, search]);

  const confirmBooking = async (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking || !canConfirmBooking(booking.status, isRestaurantVisible)) return;

    const now = new Date().toISOString();

    const { error } = await supabaseBrowser
      .from("restaurant_bookings")
      .update({
        status: "confirmed",
        read: true,
        updated_at: now,
      })
      .eq("id", bookingId);

    if (error) return;

    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? { ...b, status: "confirmed", read: true, updated_at: now }
          : b
      )
    );

    if (activeBooking?.id === bookingId) {
      setActiveBooking((prev) =>
        prev ? { ...prev, status: "confirmed", read: true, updated_at: now } : prev
      );
    }

    debouncedRefetch();
  };

  const openDetailsModal = async (booking) => {
    setActiveBooking(booking);
    setShowDetailsModal(true);

    const { data } = await supabaseBrowser
      .from("restaurant_bookings")
      .select(BOOKING_SELECT_FIELDS)
      .eq("id", booking.id)
      .maybeSingle();

    if (mountedRef.current && data) {
      setActiveBooking(data);
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setActiveBooking(null);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search guest name, phone or booking code"
              className="pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none w-full"
            />
          </div>

          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
          >
            <option value="all">All bookings</option>
            <option value="paid">Paid</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Guest details</th>
              <th className="px-4 py-3 text-left">Reservation</th>
              <th className="px-4 py-3 text-left">Guests</th>
              <th className="px-4 py-3 text-left">Customer note</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {loading &&
              Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}

            {!loading && bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No bookings found
                </td>
              </tr>
            )}

            {!loading &&
              bookings.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => openDetailsModal(b)}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">
                      {b.customer_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {b.customer_phone}
                      {b.booking_code && ` • ${b.booking_code}`}
                      {needsRestaurantDecision(b.status) && b.read === false && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 text-[10px] font-bold">
                          NEW
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {b.booking_date}
                    </div>
                    <div className="text-xs text-gray-500">
                      {String(b.booking_time).slice(0, 5)} • {b.duration_minutes} mins
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-700">
                      <Users className="h-4 w-4" />
                      {b.party_size} guests
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {b.special_request ? (
                      <div className="flex items-start gap-1 text-gray-700">
                        <StickyNote className="h-4 w-4 mt-0.5" />
                        <span className="text-xs">{b.special_request}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <StatusPill status={b.status} />
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div
                      className="flex justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canConfirmBooking(b.status, isRestaurantVisible) && (
                        <ActionButton
                          icon={CheckCircle}
                          label="Confirm"
                          color="green"
                          onClick={() => confirmBooking(b.id)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Showing{" "}
          <span className="font-semibold">
            {(page - 1) * PAGE_SIZE + 1}
          </span>{" "}
          –{" "}
          <span className="font-semibold">
            {Math.min(page * PAGE_SIZE, total)}
          </span>{" "}
          of <span className="font-semibold">{total}</span> bookings
        </div>

        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 rounded-xl border px-3 py-2 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <button
            disabled={page === totalPages || total === 0}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 rounded-xl border px-3 py-2 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showDetailsModal && activeBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">Booking details</div>
              <button onClick={closeDetailsModal}>
                <X className="h-5 w-5 hover:text-red-300 cursor-pointer text-red-600" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <DetailRow label="Booking code" value={activeBooking.booking_code} />
              <DetailRow
                label="Status"
                value={getBookingStatusLabel(activeBooking.status)}
              />
              <DetailRow label="Source" value={activeBooking.source} />
              <DetailRow label="Guest name" value={activeBooking.customer_name} />
              <DetailRow label="Phone" value={activeBooking.customer_phone} />
              <DetailRow label="Email" value={activeBooking.customer_email} />
              <DetailRow label="Date" value={formatBookingDate(activeBooking.booking_date)} />
              <DetailRow label="Time" value={formatBookingTime(activeBooking.booking_time)} />
              <DetailRow label="Duration (mins)" value={activeBooking.duration_minutes} />
              <DetailRow label="Party size" value={activeBooking.party_size} />
              <DetailRow label="Customer note" value={activeBooking.special_request} />
              <DetailRow label="Internal note" value={activeBooking.notes_internal} />
              <DetailRow label="Cancelled at" value={formatBookingDateTime(activeBooking.cancelled_at)} />
              <DetailRow label="Cancel reason" value={activeBooking.cancel_reason} />
              <DetailRow label="Total Visits" value={activeBooking.customer_booking_number} />
              <DetailRow label="Created at" value={formatBookingDateTime(activeBooking.created_at)} />
              <DetailRow label="Updated at" value={formatBookingDateTime(activeBooking.updated_at)} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeDetailsModal}
                className="rounded-xl border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer text-gray-900 px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 ">
      <div className="text-gray-500">{label}</div>
      <div className="text-gray-900 text-right">
        {value === null || value === undefined || value === ""
          ? "—"
          : String(value)}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="mt-2 h-3 w-24 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="mt-2 h-3 w-32 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-3 w-40 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-5 w-24 bg-gray-200 rounded-full" />
      </td>
      <td className="px-4 py-4">
        <div className="ml-auto h-8 w-20 bg-gray-200 rounded-xl" />
      </td>
    </tr>
  );
}

function StatusPill({ status }) {
  const normalizedStatus = normalizeBookingStatus(status);

  const map = {
    pending: ["Pending", "#92400e", "rgba(245,158,11,.15)"],
    payment_successful: ["Paid", "#92400e", "rgba(245,158,11,.15)"],
    payment_successfull: ["Paid", "#92400e", "rgba(245,158,11,.15)"],
    confirmed: ["Confirmed", "#166534", "rgba(34,197,94,.15)"],
    completed: ["Completed", "#1e40af", "rgba(59,130,246,.15)"],
    cancelled: ["Cancelled", "#991b1b", "rgba(239,68,68,.15)"],
    no_show: ["No show", "#374151", "rgba(107,114,128,.15)"],
  };

  const [label, color, bg] = map[normalizedStatus] || [
    status ? String(status) : "—",
    "#374151",
    "rgba(107,114,128,.15)",
  ];

  return (
    <span
      className="inline-flex rounded-full px-3 py-1 text-xs font-semibold border"
      style={{ color, backgroundColor: bg, borderColor: bg }}
    >
      {label}
    </span>
  );
}

function ActionButton({ icon: Icon, label, color, onClick }) {
  const styles =
    color === "green"
      ? "text-green-700 bg-green-50 border-green-200 hover:bg-green-100"
      : "text-red-700 bg-red-50 border-red-200 hover:bg-red-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold ${styles}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
