"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Loader2,
  RefreshCw,
  Search,
  Eye,
  CheckCircle2,
  RotateCcw,
  XCircle,
} from "lucide-react";

const PAYMENT_STATUS = ["PENDING", "PAID", "REFUNDED"];


function money(v) {
  const n = Number(v || 0);
  return `Rs ${n.toFixed(2)}`;
}

function paymentBadgeClass(status) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "FAILED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function orderBadgeClass(status) {
  if (status === "DELIVERED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "CANCELLED" || status === "REJECTED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "NEW" || status === "PLACED") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function parseItems(itemsRaw) {
  if (Array.isArray(itemsRaw)) return itemsRaw;
  if (!itemsRaw) return [];
  if (typeof itemsRaw === "string") {
    try {
      const parsed = JSON.parse(itemsRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function OrderDetailsModal({ open, order, onClose, onSetPaid, onSetRefunded, saving }) {
  if (!open || !order) return null;

  const items = parseItems(order.items);

  return (
    <div className="fixed inset-0 z-[90] bg-black/45 p-4 flex items-center justify-center">
      <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Order</p>
            <h3 className="text-base font-semibold text-gray-900">{order.order_no}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Customer</p>
              <p className="text-sm font-medium text-gray-900">{order.customer_name || "Walk-in"}</p>
              <p className="text-xs text-gray-600">{order.customer_phone || "-"}</p>
              <p className="text-xs text-gray-600">{order.customer_email || "-"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Payment</p>
              <p className="text-sm font-medium text-gray-900">{order.payment_method || "COD"}</p>
              <span
                className={[
                  "mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                  paymentBadgeClass(order.payment_status),
                ].join(" ")}
              >
                {order.payment_status}
              </span>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Order Status</p>
              <span
                className={[
                  "mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                  orderBadgeClass(order.status),
                ].join(" ")}
              >
                {order.status}
              </span>
              <p className="text-xs text-gray-600 mt-2">
                Created: {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 text-sm font-semibold text-gray-900">
              Items
            </div>
            {!items.length ? (
              <div className="px-3 py-4 text-sm text-gray-500">No item details in this order.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((it, idx) => (
                  <div key={idx} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-gray-900 truncate">{it?.title || it?.name || `Item ${idx + 1}`}</p>
                      <p className="text-xs text-gray-500">Qty: {Number(it?.qty || it?.quantity || 1)}</p>
                    </div>
                    <p className="text-gray-700 text-xs">{money(it?.price || 0)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div><p className="text-gray-500">Subtotal</p><p className="font-semibold">{money(order.subtotal)}</p></div>
            <div><p className="text-gray-500">Delivery</p><p className="font-semibold">{money(order.delivery_fee)}</p></div>
            <div><p className="text-gray-500">Tax</p><p className="font-semibold">{money(order.tax_amount)}</p></div>
            <div><p className="text-gray-500">Discount</p><p className="font-semibold">-{money(order.discount_amount)}</p></div>
            <div><p className="text-gray-500">Total</p><p className="font-semibold text-gray-900">{money(order.total_amount)}</p></div>
          </div>

          {order.notes ? (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 mt-1">{order.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving || order.payment_status === "PAID"}
            onClick={() => onSetPaid(order)}
            className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Mark Paid"}
          </button>
          <button
            type="button"
            disabled={saving || order.payment_status === "REFUNDED"}
            onClick={() => onSetRefunded(order)}
            className="h-9 rounded-xl bg-slate-700 hover:bg-slate-600 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Mark Refunded"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("ALL");
  const [orders, setOrders] = useState([]);

  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const [openOrder, setOpenOrder] = useState(null);

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (selectedStoreId !== "ALL" && String(o.store_id) !== String(selectedStoreId)) return false;
      if (paymentFilter !== "ALL" && o.payment_status !== paymentFilter) return false;
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (!q) return true;

      const hay = `${o.order_no || ""} ${o.customer_name || ""} ${o.customer_phone || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, selectedStoreId, paymentFilter, statusFilter, query]);

  const summary = useMemo(() => {
    const pending = visibleOrders.filter((o) => o.payment_status === "PENDING").length;
    const paid = visibleOrders.filter((o) => o.payment_status === "PAID").length;
    const refunded = visibleOrders.filter((o) => o.payment_status === "REFUNDED").length;
    const total = visibleOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
    return { pending, paid, refunded, total };
  }, [visibleOrders]);

  const loadStores = async () => {
    const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
    if (sessErr) throw sessErr;

    const userId = sess?.session?.user?.id;
    if (!userId) {
      setStores([]);
      return [];
    }

    const ownerRes = await supabaseBrowser
      .from("stores")
      .select("id,name,city")
      .eq("owner_user_id", userId)
      .order("name", { ascending: true });

    if (ownerRes.error) throw ownerRes.error;

    const memberRes = await supabaseBrowser
      .from("store_members")
      .select("store_id, stores:store_id(id,name,city)")
      .eq("user_id", userId);

    if (memberRes.error) throw memberRes.error;

    const ownerStores = ownerRes.data || [];
    const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

    const merged = new Map();
    [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));

    const allStores = Array.from(merged.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    setStores(allStores);
    return allStores;
  };

  const loadOrders = async (idsArg = null) => {
    const ids = idsArg || storeIds;
    if (!ids.length) {
      setOrders([]);
      return;
    }

    const { data, error: ordErr } = await supabaseBrowser
      .from("store_orders")
      .select(
        "id,order_no,store_id,customer_name,customer_phone,customer_email,delivery_address,notes,items,subtotal,delivery_fee,tax_amount,discount_amount,total_amount,payment_method,payment_status,status,created_at,updated_at"
      )
      .in("store_id", ids)
      .order("created_at", { ascending: false })
      .limit(300);

    if (ordErr) throw ordErr;
    setOrders(data || []);
  };

  const refreshAll = async () => {
    setRefreshing(true);
    setError("");
    setSuccess("");
    try {
      const loadedStores = await loadStores();
      await loadOrders((loadedStores || []).map((s) => s.id));
    } catch (e) {
      setError(e?.message || "Failed to load payment orders.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const loadedStores = await loadStores();
        if (cancelled) return;

        await loadOrders((loadedStores || []).map((s) => s.id));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load payment orders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storeIds.length) return;

    const filter = `store_id=in.(${storeIds.join(",")})`;

    const channel = supabaseBrowser
      .channel(`payment-orders-${storeIds.join("-")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_orders", filter },
        () => {
          loadOrders(storeIds);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [storeIds.join(",")]);

  const updatePaymentStatus = async (order, nextStatus) => {
    if (!order?.id || saving) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const { error: upErr } = await supabaseBrowser
        .from("store_orders")
        .update({ payment_status: nextStatus })
        .eq("id", order.id);

      if (upErr) throw upErr;

      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(order.id) ? { ...o, payment_status: nextStatus } : o))
      );

      setOpenOrder((prev) =>
        prev && String(prev.id) === String(order.id) ? { ...prev, payment_status: nextStatus } : prev
      );

      setSuccess(`Order ${order.order_no} marked ${nextStatus}.`);
    } catch (e) {
      setError(e?.message || "Failed to update payment status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Store Partner</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Payment Orders</h1>
          <p className="text-sm text-slate-600 mt-1">
            Track payment-only orders, payment status, and customer collection flow.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Pending Payments</p>
            <p className="text-lg font-semibold text-amber-700 mt-1">{summary.pending}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Paid Orders</p>
            <p className="text-lg font-semibold text-emerald-700 mt-1">{summary.paid}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Refunded</p>
            <p className="text-lg font-semibold text-slate-700 mt-1">{summary.refunded}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Visible Total</p>
            <p className="text-lg font-semibold text-slate-900 mt-1">{money(summary.total)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-slate-600 mb-1">Store</p>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
              >
                <option value="ALL">All Stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `• ${s.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs text-slate-600 mb-1">Payment Status</p>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
              >
                <option value="ALL">All</option>
                {PAYMENT_STATUS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            

            <div className="lg:col-span-2">
              <p className="text-xs text-slate-600 mb-1">Search</p>
              <div className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order no / customer / phone"
                  className="w-full text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading payment orders...
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No payment orders found for selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Order</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Customer</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Amount</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Payment</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Status</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Created</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-900">{o.order_no}</p>
                        <p className="text-xs text-slate-500">
                          Store: {stores.find((s) => String(s.id) === String(o.store_id))?.name || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-slate-800">{o.customer_name || "Walk-in"}</p>
                        <p className="text-xs text-slate-500">{o.customer_phone || "-"}</p>
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-900">{money(o.total_amount)}</td>
                      <td className="px-4 py-2">
                        <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", paymentBadgeClass(o.payment_status)].join(" ")}>
                          {o.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", orderBadgeClass(o.status)].join(" ")}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenOrder(o)}
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            type="button"
                            disabled={saving || o.payment_status === "PAID"}
                            onClick={() => updatePaymentStatus(o, "PAID")}
                            className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                          </button>
                          <button
                            type="button"
                            disabled={saving || o.payment_status === "REFUNDED"}
                            onClick={() => updatePaymentStatus(o, "REFUNDED")}
                            className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Refund
                          </button>
                          
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <OrderDetailsModal
        open={Boolean(openOrder)}
        order={openOrder}
        onClose={() => setOpenOrder(null)}
        onSetPaid={(o) => updatePaymentStatus(o, "PAID")}
        onSetRefunded={(o) => updatePaymentStatus(o, "REFUNDED")}
        saving={saving}
      />
    </div>
  );
}
