"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Bell,
  Clock3,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  Store,
  MessageSquare
} from "lucide-react";

function Card({ title, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-gray-900">{title}</div>
        {right || null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function timeAgo(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return "just now";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function currency(v) {
  const n = Number(v || 0);
  return `MUR ${n.toLocaleString()}`;
}

function normalizeOrder(raw) {
  return {
    id: String(raw.id),
    order_no: raw.order_no || raw.order_number || raw.id,
    store_id: String(raw.store_id || ""),
    customer_name: raw.customer_name || raw.customer || "Customer",
    customer_phone: raw.customer_phone || raw.phone || "",
    items: Array.isArray(raw.items) ? raw.items : [],
    total_amount: Number(raw.total_amount || raw.total || 0),
    status: String(raw.status || "NEW"),
    payment_method: raw.payment_method || "N/A",
    delivery_address: raw.delivery_address || raw.address || "",
    notes: raw.notes || "",
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export default function StorePartnerOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [err, setErr] = useState("");

  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("all");
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const storeNameById = useMemo(() => {
    const m = {};
    stores.forEach((s) => (m[String(s.id)] = s.name));
    return m;
  }, [stores]);

  const filteredOrders = useMemo(() => {
    if (storeFilter === "all") return orders;
    return orders.filter((o) => String(o.store_id) === String(storeFilter));
  }, [orders, storeFilter]);

  const selectedOrder = useMemo(
    () => filteredOrders.find((o) => String(o.id) === String(selectedOrderId)) || null,
    [filteredOrders, selectedOrderId]
  );

  const loadStoresAndOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setErr("");

      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const uid = sess?.session?.user?.id;

      if (!uid) {
        router.replace("/sign-in");
        return;
      }

      const ownerRes = await supabaseBrowser
        .from("stores")
        .select("id,name,city,is_active")
        .eq("owner_user_id", uid);

      if (ownerRes.error) throw ownerRes.error;

      const memberRes = await supabaseBrowser
        .from("store_members")
        .select("store_id, stores:store_id (id,name,city,is_active)")
        .eq("user_id", uid);

      if (memberRes.error) throw memberRes.error;

      const ownerStores = ownerRes.data || [];
      const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

      const map = new Map();
      [...ownerStores, ...memberStores].forEach((s) => map.set(String(s.id), s));
      const storeList = Array.from(map.values()).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );

      setStores(storeList);

      const storeIds = storeList.map((s) => s.id);
      if (!storeIds.length) {
        setOrders([]);
        setSelectedOrderId("");
        return;
      }

      // Expects table: store_orders (recommended)
      // Fields used: id, order_no, store_id, customer_name, customer_phone, items, total_amount, status, payment_method, delivery_address, notes, created_at
      const ordersRes = await supabaseBrowser
        .from("store_orders")
        .select("*")
        .in("store_id", storeIds)
        .in("status", ["NEW", "PLACED", "PENDING"])
        .order("created_at", { ascending: false });

      if (ordersRes.error) throw ordersRes.error;

      const list = (ordersRes.data || []).map(normalizeOrder);
      setOrders(list);
      if (list.length && !selectedOrderId) setSelectedOrderId(String(list[0].id));
      if (!list.length) setSelectedOrderId("");
    } catch (e) {
      setErr(
        e?.message ||
          "Failed to load orders. Ensure table `store_orders` exists and has expected columns."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStoresAndOrders(false);
    const t = setInterval(() => loadStoresAndOrders(true), 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateOrderStatus = async (orderId, nextStatus) => {
    try {
      setSavingId(orderId);
      setErr("");

      const { error } = await supabaseBrowser
        .from("store_orders")
        .update({ status: nextStatus })
        .eq("id", orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o))
      );
    } catch (e) {
      setErr(e?.message || "Failed to update order status.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/store-partner/dashboard")}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={() => loadStoresAndOrders(true)}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
            <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <Card
              title="New Orders"
              right={
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-semibold text-gray-700">
                    {filteredOrders.length}
                  </span>
                </div>
              }
            >
              <div className="mb-4 max-w-sm">
                <div className="text-xs font-semibold text-gray-600 mb-2">Filter Store</div>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  <option value="all">All Stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {!filteredOrders.length ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <MessageSquare className="h-5 w-5 text-gray-500 mx-auto" />
                  <div className="mt-2 text-sm text-gray-600">No new orders.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrderId(String(o.id))}
                      className={`w-full text-left rounded-2xl border p-4 ${
                        String(selectedOrderId) === String(o.id)
                          ? "border-orange-200 bg-orange-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-gray-900">#{o.order_no}</div>
                        <div className="text-xs text-gray-500">{timeAgo(o.created_at)}</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{o.customer_name}</div>
                      <div className="mt-1 text-xs text-gray-500 inline-flex items-center gap-1">
                        <Store className="h-3.5 w-3.5" />
                        {storeNameById[String(o.store_id)] || "Store"}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-gray-900">{currency(o.total_amount)}</div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Order Details">
              {!selectedOrder ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  Select an order to view details.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">
                        #{selectedOrder.order_no}
                      </div>
                      <div className="text-xs text-gray-500 inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {timeAgo(selectedOrder.created_at)}
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-gray-700">{selectedOrder.customer_name}</div>
                    {selectedOrder.customer_phone ? (
                      <div className="mt-1 text-xs text-gray-600 inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {selectedOrder.customer_phone}
                      </div>
                    ) : null}
                    {selectedOrder.delivery_address ? (
                      <div className="mt-1 text-xs text-gray-600 inline-flex items-start gap-1">
                        <MapPin className="h-3.5 w-3.5 mt-0.5" />
                        {selectedOrder.delivery_address}
                      </div>
                    ) : null}

                    <div className="mt-2 text-xs text-gray-500">
                      Payment: {selectedOrder.payment_method}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-2">Items</div>
                    <div className="space-y-2">
                      {(selectedOrder.items || []).length ? (
                        selectedOrder.items.map((it, i) => (
                          <div
                            key={`${selectedOrder.id}_item_${i}`}
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center justify-between"
                          >
                            <div className="text-sm text-gray-800">
                              {it.name || it.title || "Item"}
                            </div>
                            <div className="text-xs text-gray-600">
                              x{it.qty || it.quantity || 1}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No items payload.</div>
                      )}
                    </div>
                  </div>

                  {selectedOrder.notes ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                      {selectedOrder.notes}
                    </div>
                  ) : null}

                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">Total</div>
                    <div className="text-lg font-bold text-gray-900">
                      {currency(selectedOrder.total_amount)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(selectedOrder.id, "ACCEPTED")}
                      disabled={savingId === selectedOrder.id}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                      style={{
                        background:
                          "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)",
                      }}
                    >
                      {savingId === selectedOrder.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => updateOrderStatus(selectedOrder.id, "REJECTED")}
                      disabled={savingId === selectedOrder.id}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                      style={{
                        background:
                          "linear-gradient(90deg, #dc2626 0%, #ef4444 100%)",
                      }}
                    >
                      {savingId === selectedOrder.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
