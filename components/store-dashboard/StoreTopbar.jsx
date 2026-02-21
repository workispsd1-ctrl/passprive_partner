"use client";

import { Bell, LogOut, ShoppingCart, CreditCard, Store, Clock3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TITLE_BY_ROUTE = [
  { prefix: "/store-partner/all-stores/add", title: "Add Store" },
  { prefix: "/store-partner/all-stores", title: "My Stores" },
  { prefix: "/store-partner/pickup-orders", title: "Pickup Orders" },
  { prefix: "/store-partner/payment-orders", title: "Payment Orders" },
  { prefix: "/store-partner/offers", title: "Offers" },
  { prefix: "/store-partner/catalogue", title: "Catalogue" },
  { prefix: "/store-partner/inventory", title: "Inventory" },
  { prefix: "/store-partner/reviews", title: "Reviews" },
  { prefix: "/store-partner/payouts", title: "Payouts" },
  { prefix: "/store-partner/settings", title: "Settings" },
  { prefix: "/store-partner/dashboard", title: "Dashboard" },
];

function timeAgo(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return "now";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function normalizeMemberStore(storesField) {
  if (Array.isArray(storesField)) return storesField[0] || null;
  return storesField || null;
}

function flowTypeFromOrder(order) {
  const raw = String(order?.order_flow || order?.metadata?.order_flow || "").toUpperCase();
  if (raw === "PREMIUM") return "pickup";
  if (raw === "BASIC") return "payment";
  return "payment";
}

export default function StoreTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef(null);

  const [roleLabel, setRoleLabel] = useState("Outlet Manager");
  const [storeIds, setStoreIds] = useState([]);
  const [storeNameById, setStoreNameById] = useState({});
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const pageTitle = useMemo(() => {
    if (/^\/store-partner\/all-stores\/[^/]+\/edit$/.test(pathname)) return "Edit Store";
    if (/^\/store-partner\/all-stores\/[^/]+$/.test(pathname)) return "Store Details";

    const match = TITLE_BY_ROUTE.reduce((best, item) => {
      const isMatch = pathname === item.prefix || pathname.startsWith(item.prefix + "/");
      if (!isMatch) return best;
      if (!best || item.prefix.length > best.prefix.length) return item;
      return best;
    }, null);

    return match?.title || "Dashboard";
  }, [pathname]);

  const unseenNotifications = useMemo(
    () => notifications.filter((n) => !n.partner_seen_at),
    [notifications]
  );

  const pickupCount = useMemo(
    () => unseenNotifications.filter((n) => n.type === "pickup").length,
    [unseenNotifications]
  );

  const paymentCount = useMemo(
    () => unseenNotifications.filter((n) => n.type === "payment").length,
    [unseenNotifications]
  );

  const totalCount = pickupCount + paymentCount;
  const totalBadge = totalCount > 10 ? "10+" : String(totalCount);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sess?.session?.user?.id;
        if (!userId) return;

        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name")
          .eq("owner_user_id", userId);

        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id(id,name)")
          .eq("user_id", userId);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || [])
          .map((r) => normalizeMemberStore(r.stores))
          .filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));
        const allStores = Array.from(merged.values());

        if (cancelled) return;

        const ids = allStores.map((s) => s.id);
        const names = {};
        allStores.forEach((s) => {
          names[String(s.id)] = s.name || "Store";
        });

        setStoreIds(ids);
        setStoreNameById(names);
        setRoleLabel(ownerStores.length > 0 ? "Outlet Owner" : "Outlet Manager");
      } catch {
        if (!cancelled) {
          setRoleLabel("Outlet Manager");
          setStoreIds([]);
          setStoreNameById({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storeIds.length) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      setNotifLoading(true);
      try {
        const { data, error } = await supabaseBrowser
          .from("store_orders")
          .select(
            "id,order_no,order_number,store_id,customer_name,total_amount,status,order_flow,metadata,partner_seen_at,created_at"
          )
          .in("store_id", storeIds)
          .in("status", ["NEW", "PLACED"])
          .order("created_at", { ascending: false })
          .limit(25);

        if (error) throw error;

        const rows = (data || []).map((o) => ({
          id: String(o.id),
          order_no: o.order_no || o.order_number || o.id,
          store_id: String(o.store_id || ""),
          store_name: storeNameById[String(o.store_id)] || "Store",
          customer_name: o.customer_name || "Customer",
          total_amount: Number(o.total_amount || 0),
          status: String(o.status || "NEW"),
          type: flowTypeFromOrder(o),
          partner_seen_at: o.partner_seen_at || null,
          created_at: o.created_at || new Date().toISOString(),
        }));

        setNotifications(rows);
      } catch {
        setNotifications([]);
      } finally {
        setNotifLoading(false);
      }
    };

    fetchNotifications();
    const t = setInterval(fetchNotifications, 20000);

    const filter = `store_id=in.(${storeIds.join(",")})`;
    const channel = supabaseBrowser
      .channel(`topbar-orders-${storeIds.join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_orders", filter }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      clearInterval(t);
      supabaseBrowser.removeChannel(channel);
    };
  }, [storeIds.join(","), JSON.stringify(storeNameById)]);

  const onNotificationClick = (n) => {
    setNotifOpen(false);
    router.push(n.type === "pickup" ? "/store-partner/pickup-orders" : "/store-partner/payment-orders");
  };

  const onLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xl font-bold text-gray-900 truncate">{pageTitle}</div>
          <div className="text-xs text-gray-500 mt-0.5">{roleLabel}</div>
        </div>

        <div className="flex items-center gap-3" ref={dropdownRef}>
          <div className="relative">
            <button
              className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 relative"
              type="button"
              aria-label="Notifications"
              onClick={() => setNotifOpen((v) => !v)}
            >
              <Bell className="h-4 w-4 text-gray-700" />
              {totalCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
                  {totalBadge}
                </span>
              ) : null}
            </button>

            {notifOpen ? (
              <div className="absolute right-0 mt-2 w-[360px] rounded-2xl border border-gray-200 bg-white shadow-xl p-2 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">New Orders</div>
                  <div className="text-xs text-gray-500">
                    Pickup: {pickupCount} • Payment: {paymentCount}
                  </div>
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {notifLoading ? (
                    <div className="p-4 text-sm text-gray-500">Loading...</div>
                  ) : unseenNotifications.length ? (
                    unseenNotifications.slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onNotificationClick(n)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-xl"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-900">#{n.order_no}</div>
                          <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-700">{n.customer_name}</div>
                        <div className="mt-0.5 text-[11px] text-gray-500 inline-flex items-center gap-1">
                          <Store className="h-3 w-3" />
                          {n.store_name}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
                          {n.type === "pickup" ? (
                            <>
                              <ShoppingCart className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-700">Pickup Order</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3 w-3 text-indigo-600" />
                              <span className="text-indigo-700">Payment Order</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No new notifications.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <button
            onClick={onLogout}
            className="h-10 rounded-xl border border-gray-200 bg-red-600 hover:bg-red-500 text-white px-3 text-sm font-medium flex items-center gap-2 cursor-pointer"
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
