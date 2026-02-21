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
  MessageSquare,
  PackageCheck,
  ChefHat,
  ReceiptText,
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

function stockStatusFromQty(qty, low = 5) {
  const q = Number(qty || 0);
  const l = Number(low || 5);
  if (q <= 0) return "out_of_stock";
  if (q <= l) return "low_stock";
  return "in_stock";
}

function statusChipClass(status) {
  if (["NEW", "PLACED"].includes(status)) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (["ACCEPTED", "PREPARING", "READY"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "DELIVERED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["REJECTED", "CANCELLED"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function parseItems(rawItems) {
  if (Array.isArray(rawItems)) return rawItems;
  if (!rawItems) return [];
  if (typeof rawItems === "string") {
    try {
      const parsed = JSON.parse(rawItems);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeOrder(raw) {
  return {
    id: String(raw.id),
    order_no: raw.order_no || raw.order_number || raw.id,
    store_id: String(raw.store_id || ""),
    customer_name: raw.customer_name || raw.customer || "Customer",
    customer_phone: raw.customer_phone || raw.phone || "",
    customer_email: raw.customer_email || "",
    items: parseItems(raw.items),
    total_amount: Number(raw.total_amount || raw.total || 0),
    payment_status: String(raw.payment_status || "PENDING"),
    payment_method: raw.payment_method || "N/A",
    status: String(raw.status || "NEW"),
    delivery_address: raw.delivery_address || raw.address || "",
    notes: raw.notes || "",
    created_at: raw.created_at || new Date().toISOString(),
    accepted_at: raw.accepted_at || null,
    rejected_at: raw.rejected_at || null,
    delivered_at: raw.delivered_at || null,
  };
}

export default function StorePartnerOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [currentUserId, setCurrentUserId] = useState("");

  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const storeNameById = useMemo(() => {
    const m = {};
    stores.forEach((s) => (m[String(s.id)] = s.name));
    return m;
  }, [stores]);

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const filteredOrders = useMemo(() => {
    let list = orders;

    if (storeFilter !== "all") {
      list = list.filter((o) => String(o.store_id) === String(storeFilter));
    }

    if (statusFilter === "OPEN") {
      list = list.filter((o) => ["NEW", "PLACED", "ACCEPTED", "PREPARING", "READY"].includes(o.status));
    } else if (statusFilter !== "ALL") {
      list = list.filter((o) => o.status === statusFilter);
    }

    return list;
  }, [orders, storeFilter, statusFilter]);

  const selectedOrder = useMemo(
    () => filteredOrders.find((o) => String(o.id) === String(selectedOrderId)) || null,
    [filteredOrders, selectedOrderId]
  );

  const loadStoresAndOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setErr("");
      setOk("");

      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const uid = sess?.session?.user?.id;

      if (!uid) {
        router.replace("/sign-in");
        return;
      }
      setCurrentUserId(uid);

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

      const ids = storeList.map((s) => s.id);
      if (!ids.length) {
        setOrders([]);
        setSelectedOrderId("");
        return;
      }

      const ordersRes = await supabaseBrowser
        .from("store_orders")
        .select("*")
        .in("store_id", ids)
        .order("created_at", { ascending: false });

      if (ordersRes.error) throw ordersRes.error;

      const list = (ordersRes.data || []).map(normalizeOrder);
      setOrders(list);

      const stillExists = list.some((o) => String(o.id) === String(selectedOrderId));
      if (!stillExists) setSelectedOrderId(list[0]?.id || "");
    } catch (e) {
      setErr(e?.message || "Failed to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStoresAndOrders(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeIds.length) return;

    const filter = `store_id=in.(${storeIds.join(",")})`;
    const channel = supabaseBrowser
      .channel(`store-orders-live-${storeIds.join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_orders", filter }, () =>
        loadStoresAndOrders(true)
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIds.join(",")]);

  const updateOrderStatus = async (orderId, patch) => {
    try {
      setSavingId(orderId);
      setErr("");
      setOk("");

      const { error } = await supabaseBrowser.from("store_orders").update(patch).eq("id", orderId);
      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(orderId) ? { ...o, ...patch } : o))
      );
    } catch (e) {
      setErr(e?.message || "Failed to update order.");
      throw e;
    } finally {
      setSavingId("");
    }
  };

  const decrementInventoryForOrder = async (order) => {
    const items = parseItems(order.items);
    if (!items.length) return;

    for (const it of items) {
      const itemId = it?.item_id || it?.catalogue_item_id || it?.id || null;
      const qty = Math.max(1, Number(it?.qty || it?.quantity || 1));

      if (!itemId) continue;

      const { data: dbItem, error: itemErr } = await supabaseBrowser
        .from("store_catalogue_items")
        .select("id,store_id,title,track_inventory,stock_qty,low_stock_threshold,is_available")
        .eq("id", itemId)
        .eq("store_id", order.store_id)
        .maybeSingle();

      if (itemErr || !dbItem) continue;
      if (!dbItem.track_inventory) continue;

      const before = Number(dbItem.stock_qty || 0);
      const after = Math.max(0, before - qty);
      const nextStatus = stockStatusFromQty(after, Number(dbItem.low_stock_threshold || 5));

      const { error: upErr } = await supabaseBrowser
        .from("store_catalogue_items")
        .update({
          stock_qty: after,
          stock_status: nextStatus,
          is_available: nextStatus !== "out_of_stock",
        })
        .eq("id", dbItem.id);

      if (upErr) continue;

      await supabaseBrowser.from("store_catalogue_stock_movements").insert({
        store_id: order.store_id,
        item_id: dbItem.id,
        movement_type: after === 0 && before > 0 ? "STOCKOUT" : "DECREASE",
        qty_delta: -qty,
        qty_before: before,
        qty_after: after,
        reason: `Order collected: ${order.order_no}`,
        actor_user_id: currentUserId || null,
      });
    }
  };

  const onAccept = async (order) => {
    await updateOrderStatus(order.id, { status: "ACCEPTED", accepted_at: new Date().toISOString() });
    setOk(`Order ${order.order_no} accepted.`);
  };

  const onPrepare = async (order) => {
    await updateOrderStatus(order.id, { status: "PREPARING" });
    setOk(`Order ${order.order_no} moved to preparing.`);
  };

  const onReady = async (order) => {
    await updateOrderStatus(order.id, { status: "READY" });
    setOk(`Order ${order.order_no} is ready for collection.`);
  };

  const onReject = async (order) => {
    await updateOrderStatus(order.id, { status: "REJECTED", rejected_at: new Date().toISOString() });
    setOk(`Order ${order.order_no} rejected.`);
  };

  const onCollected = async (order) => {
    if (order.status === "DELIVERED") return;
    if (!window.confirm("Mark this order as collected and reduce stock?")) return;

    try {
      setSavingId(order.id);
      setErr("");
      setOk("");

      await updateOrderStatus(order.id, {
        status: "DELIVERED",
        delivered_at: new Date().toISOString(),
      });

      await decrementInventoryForOrder(order);
      setOk(`Order ${order.order_no} marked collected and inventory updated.`);
    } catch {
      // error set in called methods
    } finally {
      setSavingId("");
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}
    >
      <div className="mx-auto max-w-7xl px-6 py-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div></div>

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

        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
            <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.08fr_0.92fr] gap-6">
            <Card
              title="Pickup Orders"
              right={
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-semibold text-gray-700">{filteredOrders.length}</span>
                </div>
              }
            >
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div>
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

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">Filter Status</div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  >
                    <option value="OPEN">Open Orders</option>
                    <option value="ALL">All</option>
                    <option value="NEW">NEW</option>
                    <option value="PLACED">PLACED</option>
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="PREPARING">PREPARING</option>
                    <option value="READY">READY</option>
                    <option value="DELIVERED">DELIVERED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              </div>

              {!filteredOrders.length ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <MessageSquare className="h-5 w-5 text-gray-500 mx-auto" />
                  <div className="mt-2 text-sm text-gray-600">No orders found.</div>
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

                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{currency(o.total_amount)}</div>
                        <span
                          className={[
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            statusChipClass(o.status),
                          ].join(" ")}
                        >
                          {o.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Order Details"
              right={
                selectedOrder ? (
                  <span
                    className={[
                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                      statusChipClass(selectedOrder.status),
                    ].join(" ")}
                  >
                    {selectedOrder.status}
                  </span>
                ) : null
              }
            >
              {!selectedOrder ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  Select an order to view details.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">#{selectedOrder.order_no}</div>
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

                    <div className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1">
                      <ReceiptText className="h-3.5 w-3.5" />
                      Payment: {selectedOrder.payment_method} • {selectedOrder.payment_status}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-2">Items</div>
                    <div className="space-y-2">
                      {(selectedOrder.items || []).length ? (
                        selectedOrder.items.map((it, i) => {
                          const qty = Number(it?.qty || it?.quantity || 1);
                          const itemTitle = it?.name || it?.title || "Item";
                          return (
                            <div
                              key={`${selectedOrder.id}_item_${i}`}
                              className="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center justify-between"
                            >
                              <div className="text-sm text-gray-800">{itemTitle}</div>
                              <div className="text-xs text-gray-600">x{qty}</div>
                            </div>
                          );
                        })
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
                    <div className="text-lg font-bold text-gray-900">{currency(selectedOrder.total_amount)}</div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onAccept(selectedOrder)}
                      disabled={savingId === selectedOrder.id || ["ACCEPTED", "PREPARING", "READY", "DELIVERED"].includes(selectedOrder.status)}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: "linear-gradient(90deg, #16a34a 0%, #22c55e 100%)" }}
                    >
                      {savingId === selectedOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => onPrepare(selectedOrder)}
                      disabled={savingId === selectedOrder.id || ["PREPARING", "READY", "DELIVERED", "REJECTED", "CANCELLED"].includes(selectedOrder.status)}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)" }}
                    >
                      <ChefHat className="h-4 w-4" />
                      Preparing
                    </button>

                    <button
                      type="button"
                      onClick={() => onReady(selectedOrder)}
                      disabled={savingId === selectedOrder.id || ["READY", "DELIVERED", "REJECTED", "CANCELLED"].includes(selectedOrder.status)}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: "linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)" }}
                    >
                      <PackageCheck className="h-4 w-4" />
                      Mark Ready
                    </button>

                    <button
                      type="button"
                      onClick={() => onCollected(selectedOrder)}
                      disabled={savingId === selectedOrder.id || ["DELIVERED", "REJECTED", "CANCELLED"].includes(selectedOrder.status)}
                      className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: "linear-gradient(90deg, #0f766e 0%, #14b8a6 100%)" }}
                    >
                      {savingId === selectedOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                      Collected (Reduce Stock)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReject(selectedOrder)}
                    disabled={savingId === selectedOrder.id || ["DELIVERED", "REJECTED", "CANCELLED"].includes(selectedOrder.status)}
                    className="h-10 w-full rounded-full px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(90deg, #dc2626 0%, #ef4444 100%)" }}
                  >
                    {savingId === selectedOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Reject Order
                  </button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
