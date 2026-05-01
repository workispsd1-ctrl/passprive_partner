"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Bell, Phone, Hash, ArrowLeft } from "lucide-react";

const STATUS = {
  PLACED: "PLACED",
  CONFIRMED: "CONFIRMED",
  PREPARING: "PREPARING",
  SERVED: "SERVED",
  COMPLETED: "COMPLETED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
};

const TABLE_BLINK_COLORS = [
  { ring: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  { ring: "#06b6d4", glow: "rgba(6,182,212,0.35)" },
  { ring: "#22c55e", glow: "rgba(34,197,94,0.35)" },
  { ring: "#a855f7", glow: "rgba(168,85,247,0.35)" },
  { ring: "#ef4444", glow: "rgba(239,68,68,0.35)" },
];

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-MU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function toItems(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  return [];
}

function badgeClass(status) {
  if (status === STATUS.PLACED) return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === STATUS.CONFIRMED) return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === STATUS.PREPARING) return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === STATUS.SERVED) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === STATUS.COMPLETED) return "bg-teal-50 text-teal-700 border-teal-200";
  if (status === STATUS.PAID) return "bg-lime-50 text-lime-700 border-lime-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function statusLabel(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function blinkAccent(tableNo) {
  const n = Number(tableNo || 0);
  if (!Number.isInteger(n) || n <= 0) return TABLE_BLINK_COLORS[0];
  return TABLE_BLINK_COLORS[(n - 1) % TABLE_BLINK_COLORS.length];
}

function orderContentSignature(row) {
  const items = Array.isArray(row?.order_items)
    ? [...row.order_items]
        .map((it) => ({
          id: String(it?.item_id || it?.id || it?.name || ""),
          qty: Number(it?.qty || 0),
          unit: Number(it?.unit_price || 0),
          line: Number(it?.line_total || 0),
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    : [];

  return JSON.stringify({
    items,
    notes: String(row?.notes || ""),
    subtotal: Number(row?.subtotal_amount || 0),
    tax: Number(row?.tax_amount || 0),
    total: Number(row?.total_amount || 0),
  });
}

export default function TableOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [tableLayoutNumbers, setTableLayoutNumbers] = useState([]);
  const [selectedTableNo, setSelectedTableNo] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState("");
  const [openItemsPopoverId, setOpenItemsPopoverId] = useState("");
  const [draftStatusById, setDraftStatusById] = useState({});
  const [lastStatusById, setLastStatusById] = useState({});
  const [orderAlert, setOrderAlert] = useState(null);
  const knownOrderIdsRef = useRef(new Set());
  const knownOrderSnapshotRef = useRef(new Map());
  const lastNotifyKeyRef = useRef("");
  const lastNotifyAtRef = useRef(0);
  const tableLayoutLoadedRef = useRef(false);
  const [blinkingTables, setBlinkingTables] = useState({});
  const realtimeCleanupRef = useRef(null);

  const orderedList = useMemo(() => {
    const list = [...orders].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });

    if (selectedTableNo) {
      const tableNumber = Number(selectedTableNo);
      return list.filter((o) => Number(o.table_no || 0) === tableNumber);
    }
    if (activeFilter === "ALL") return list;
    return list.filter((o) => o.booking_status === activeFilter);
  }, [orders, activeFilter, selectedTableNo]);

  const counts = useMemo(() => {
    const c = { ALL: orders.length };
    for (const s of Object.values(STATUS)) c[s] = 0;
    for (const o of orders) c[o.booking_status] = (c[o.booking_status] || 0) + 1;
    return c;
  }, [orders]);

  const tableCards = useMemo(() => {
    const fallbackTables = Array.from(
      new Set(
        orders
          .map((o) => Number(o?.table_no || 0))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    ).sort((a, b) => a - b);

    const sourceNos = (tableLayoutNumbers.length ? tableLayoutNumbers : fallbackTables).filter(
      (n) => Number.isInteger(Number(n)) && Number(n) > 0
    );
    const maxTableNo = sourceNos.length ? Math.max(...sourceNos.map((n) => Number(n))) : 0;
    const tableNos = maxTableNo > 0
      ? Array.from({ length: maxTableNo }, (_, idx) => idx + 1)
      : [];

    return tableNos.map((tableNo) => {
      const tableOrders = orders.filter((o) => Number(o?.table_no || 0) === Number(tableNo));
      const latest = [...tableOrders].sort(
        (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
      )[0] || null;
      const status = String(latest?.booking_status || "").toUpperCase();
      const paymentStatus = String(latest?.payment_status || "").toUpperCase();
      const isOccupied = Boolean(
        latest &&
          status !== "CANCELLED" &&
          !(status === "PAID" || paymentStatus === "PAID" || paymentStatus === "COMPLETED")
      );

      return {
        tableNo: Number(tableNo),
        latest,
        isOccupied,
        isBlinking: Boolean(blinkingTables[String(tableNo)]),
        blinkColor: blinkAccent(tableNo),
      };
    });
  }, [orders, tableLayoutNumbers, blinkingTables]);

  const liveOrders = useMemo(
    () =>
      orderedList.filter((o) => {
        const status = String(o.booking_status || "").toUpperCase();
        return status !== STATUS.COMPLETED && status !== STATUS.PAID;
      }),
    [orderedList]
  );
  const completedOrders = useMemo(
    () =>
      orderedList.filter((o) => {
        const status = String(o.booking_status || "").toUpperCase();
        return status === STATUS.COMPLETED || status === STATUS.PAID;
      }),
    [orderedList]
  );

  useEffect(() => {
    init();

    return () => {
      if (realtimeCleanupRef.current) realtimeCleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = {};
    for (const o of orders) next[o.id] = o.booking_status;
    setDraftStatusById(next);
  }, [orders]);

  useEffect(() => {
    if (!openItemsPopoverId) return;
    if (!orders.some((o) => String(o.id) === String(openItemsPopoverId))) {
      setOpenItemsPopoverId("");
    }
  }, [orders, openItemsPopoverId]);

  useEffect(() => {
    if (!openItemsPopoverId) return;
    const onDocClick = () => setOpenItemsPopoverId("");
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openItemsPopoverId]);

  async function init() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: authErr,
    } = await supabaseBrowser.auth.getUser();

    if (authErr) {
      setError(authErr.message || "Failed to read user.");
      setLoading(false);
      return;
    }

    if (!user) {
      setError("Not logged in.");
      setLoading(false);
      return;
    }

    const ownerRes = await supabaseBrowser
      .from("restaurants")
      .select("id,name")
      .eq("owner_user_id", user.id)
      .limit(1)
      .maybeSingle();

    let restaurant = ownerRes?.data || null;
    if (!restaurant?.id) {
      const staffRes = await supabaseBrowser
        .from("restaurant_staff")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      const staffRid = staffRes?.data?.restaurant_id;
      if (staffRid) {
        const staffRestaurantRes = await supabaseBrowser
          .from("restaurants")
          .select("id,name")
          .eq("id", staffRid)
          .maybeSingle();
        restaurant = staffRestaurantRes?.data || null;
      }
    }

    if (!restaurant?.id) {
      setError("Restaurant not found for this account.");
      setLoading(false);
      return;
    }

    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name || "Restaurant");

    await loadTableLayoutNumbers(restaurant.id);
    await fetchOrders(restaurant.id, true);
    realtimeCleanupRef.current = subscribeRealtime(restaurant.id);

    setLoading(false);
  }

  async function loadTableLayoutNumbers(rid) {
    const { data, error } = await supabaseBrowser
      .from("restaurant_table_layouts")
      .select("table_no")
      .eq("restaurant_id", rid)
      .order("table_no", { ascending: true });

    if (error) return;
    const next = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .map((row) => Number(row?.table_no || 0))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    ).sort((a, b) => a - b);
    setTableLayoutNumbers(next);
    tableLayoutLoadedRef.current = true;
  }

  async function fetchOrders(rid = restaurantId, firstLoad = false) {
    if (!rid) return;

    if (!firstLoad) setRefreshing(true);

    const { data, error: qErr } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false });

    if (qErr) {
      setError(qErr.message || "Failed to load orders.");
      setRefreshing(false);
      return;
    }

    const next = Array.isArray(data) ? data : [];
    if (!tableLayoutLoadedRef.current && tableLayoutNumbers.length === 0 && next.length > 0) {
      const derived = Array.from(
        new Set(
          next
            .map((o) => Number(o?.table_no || 0))
            .filter((n) => Number.isInteger(n) && n > 0)
        )
      ).sort((a, b) => a - b);
      if (derived.length > 0) setTableLayoutNumbers(derived);
    }

    if (!firstLoad) {
      const currentIds = knownOrderIdsRef.current;
      const prevSnapshot = knownOrderSnapshotRef.current;
      const newOrders = [];
      const contentUpdatedOrders = [];

      for (const o of next) {
        if (!currentIds.has(o.id)) {
          newOrders.push(o);
        }
        const prev = prevSnapshot.get(o.id);
        if (prev) {
          if (orderContentSignature(prev) !== orderContentSignature(o)) {
            contentUpdatedOrders.push(o);
          }
        }
      }

      const blinkByTable = new Set(
        [...newOrders, ...contentUpdatedOrders]
          .map((row) => Number(row?.table_no || 0))
          .filter((n) => Number.isInteger(n) && n > 0)
      );
      if (blinkByTable.size > 0) {
        setBlinkingTables((prev) => {
          const nextBlink = { ...prev };
          for (const tableNo of blinkByTable) {
            nextBlink[String(tableNo)] = true;
          }
          return nextBlink;
        });
      }

      const newestNew = newOrders.length > 0 ? newOrders[0] : null;
      if (newestNew?.id) {
        const notifyTarget = newestNew;
        const qtySum = Array.isArray(notifyTarget.order_items)
          ? notifyTarget.order_items.reduce((sum, i) => sum + Number(i?.qty || 0), 0)
          : 0;
        const notifyKey = [
          String(notifyTarget.id),
          String(notifyTarget.updated_at || notifyTarget.created_at || ""),
          String(notifyTarget.total_amount || ""),
          String(qtySum),
        ].join("|");

        const now = Date.now();
        const isDuplicate = notifyKey === lastNotifyKeyRef.current && now - lastNotifyAtRef.current < 7000;
        if (!isDuplicate) {
          lastNotifyKeyRef.current = notifyKey;
          lastNotifyAtRef.current = now;
          playOrderSound();
          const msg = `New order received for table ${notifyTarget.table_no || "?"}`;
          setOrderAlert({
            id: String(notifyTarget.id),
            message: msg,
            tableNo: Number(notifyTarget.table_no || 0) || "—",
            customerName: notifyTarget.customer_name || "Guest",
            totalAmount: Number(notifyTarget.total_amount || 0),
          });
        }
      }
    }

    knownOrderIdsRef.current = new Set(next.map((o) => o.id));
    knownOrderSnapshotRef.current = new Map(next.map((o) => [o.id, o]));
    setOrders(next);
    setRefreshing(false);
  }

  function subscribeRealtime(rid) {
    const channel = supabaseBrowser
      .channel(`table-orders-${rid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_table_bookings",
          filter: `restaurant_id=eq.${rid}`,
        },
        () => {
          fetchOrders(rid, false);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }

  useEffect(() => {
    if (!restaurantId) return;
    const interval = setInterval(() => fetchOrders(restaurantId, false), 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, tableLayoutNumbers.length]);

  function playOrderSound() {
    try {
      const a = new Audio("/sounds/new-order.wav");
      a.volume = 0.9;
      a.play().catch(() => {});
    } catch {}
  }

  function printBill(order) {
    if (typeof window === "undefined") return;
    const esc = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const mur = (value) => `MUR ${money(value)}`;
    const items = toItems(order?.order_items);
    const rows = items.length
      ? items
          .map((it, idx) => {
            const qty = Number(it?.qty || 0);
            const unit = Number(it?.unit_price || 0);
            const line = Number(it?.line_total || qty * unit);
            return `<tr>
              <td class="col-index">${idx + 1}</td>
              <td class="col-item">${esc(it?.name || "Item")}</td>
              <td class="col-qty">${qty}</td>
              <td class="col-money">${mur(unit)}</td>
              <td class="col-money">${mur(line)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" class="empty">No items found</td></tr>`;
    const orderIdShort = String(order?.id || "").slice(0, 8).toUpperCase();
    const createdAt = order?.created_at ? new Date(order.created_at).toLocaleString() : "—";
    const paymentMethod = String(order?.payment_method || "—").toUpperCase();
    const paymentStatus = String(order?.payment_status || "—").toUpperCase();
    const bookingStatus = String(order?.booking_status || "—").toUpperCase();
    const customerName = esc(order?.customer_name || "Guest");
    const customerPhone = esc(order?.customer_phone || "—");
    const note = esc(order?.notes || "—");
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${orderIdShort}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        background: #fff;
      }
      .invoice {
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 14px;
      }
      .brand h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
        letter-spacing: 0.2px;
      }
      .brand .sub {
        margin-top: 3px;
        color: #475569;
        font-size: 12px;
      }
      .doc h2 {
        margin: 0;
        font-size: 18px;
        text-align: right;
      }
      .doc .meta {
        margin-top: 4px;
        color: #334155;
        font-size: 12px;
        text-align: right;
        line-height: 1.5;
      }
      .cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 12px;
      }
      .card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px;
      }
      .card .title {
        font-size: 11px;
        color: #64748b;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.45px;
      }
      .card .value {
        font-size: 13px;
        line-height: 1.5;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 14px;
      }
      thead th {
        font-size: 12px;
        color: #334155;
        background: #f8fafc;
        text-align: left;
        padding: 8px 10px;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
      }
      tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 12px;
      }
      .col-index { width: 42px; color: #475569; }
      .col-item { width: 46%; }
      .col-qty { width: 80px; text-align: center; }
      .col-money { text-align: right; white-space: nowrap; }
      .empty { text-align: center; color: #64748b; padding: 14px; }
      .totals {
        margin-top: 12px;
        margin-left: auto;
        width: 300px;
      }
      .totals .row {
        display: flex;
        justify-content: space-between;
        padding: 5px 0;
        font-size: 13px;
      }
      .totals .row.total {
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid #cbd5e1;
        font-size: 16px;
        font-weight: 700;
      }
      .note {
        margin-top: 12px;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        color: #334155;
      }
      .foot {
        margin-top: 20px;
        border-top: 1px solid #e2e8f0;
        padding-top: 10px;
        font-size: 11px;
        color: #64748b;
        text-align: center;
      }
      @media print {
        .invoice { max-width: none; }
      }
    </style>
  </head>
  <body>
    <main class="invoice">
      <section class="head">
        <div class="brand">
          <h1>${esc(restaurantName || "Restaurant")}</h1>
          <div class="sub">Restaurant Bill / Tax Invoice</div>
        </div>
        <div class="doc">
          <h2>INVOICE</h2>
          <div class="meta">
            Bill No: ${orderIdShort}<br />
            Date: ${esc(createdAt)}<br />
            Table: ${esc(order?.table_no || "—")}
          </div>
        </div>
      </section>

      <section class="cards">
        <div class="card">
          <div class="title">Customer</div>
          <div class="value">
            ${customerName}<br />
            ${customerPhone}
          </div>
        </div>
        <div class="card">
          <div class="title">Order Status</div>
          <div class="value">
            Payment: ${esc(paymentStatus)} (${esc(paymentMethod)})<br />
            Booking: ${esc(bookingStatus)}
          </div>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Qty</th>
            <th style="text-align:right">Unit Price</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="totals">
        <div class="row"><span>Subtotal</span><span>${mur(order?.subtotal_amount || 0)}</span></div>
        <div class="row"><span>Tax</span><span>${mur(order?.tax_amount || 0)}</span></div>
        <div class="row total"><span>Grand Total</span><span>${mur(order?.total_amount || 0)}</span></div>
      </section>

      <section class="note">
        <strong>Note:</strong> ${note}
      </section>

      <footer class="foot">
        This is a system-generated bill from PassPrive Partner.
      </footer>
    </main>
  </body>
</html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function updateStatus(orderId, nextStatus, fallbackStatus) {
    setUpdatingId(orderId);
    setError("");

    const nextIsPaid = String(nextStatus || "").toUpperCase() === "PAID";

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              booking_status: nextStatus,
              payment_status: nextIsPaid ? "PAID" : o.payment_status,
              updated_at: new Date().toISOString(),
            }
          : o
      )
    );
    setDraftStatusById((prev) => ({ ...prev, [orderId]: nextStatus }));

    const updatePayload = {
      booking_status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextIsPaid) {
      updatePayload.payment_status = "PAID";
    }

    const { error: upErr } = await supabaseBrowser
      .from("restaurant_table_bookings")
      .update(updatePayload)
      .eq("id", orderId);

    setUpdatingId("");

    if (upErr) {
      setError(upErr.message || "Failed to update order status.");
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, booking_status: fallbackStatus, updated_at: new Date().toISOString() } : o
        )
      );
      setDraftStatusById((prev) => ({ ...prev, [orderId]: fallbackStatus }));
    }
  }

  async function onChangeStatus(order, nextStatus) {
    if (nextStatus === order.booking_status) {
      setDraftStatusById((prev) => ({ ...prev, [order.id]: nextStatus }));
      return;
    }

    setLastStatusById((prev) => ({ ...prev, [order.id]: order.booking_status }));
    await updateStatus(order.id, nextStatus, order.booking_status);
  }

  async function onCancelDraft(order) {
    const rollbackStatus = lastStatusById[order.id] ?? order.booking_status;
    setDraftStatusById((prev) => ({ ...prev, [order.id]: rollbackStatus }));

    if (rollbackStatus !== order.booking_status) {
      await updateStatus(order.id, rollbackStatus, order.booking_status);
    }
  }

  function renderItemsWithBreakdown(order, items, preview) {
    const orderId = String(order?.id || "");
    const isOpen = openItemsPopoverId === orderId;
    const subtotal = Number(order?.subtotal_amount || 0);
    const tax = Number(order?.tax_amount || 0);
    const total = Number(order?.total_amount || 0);

    return (
      <div
        className="relative inline-flex items-center"
        onMouseLeave={() => {
          if (isOpen) setOpenItemsPopoverId("");
        }}
      >
        <div className="inline-flex items-center gap-1.5">
          <span className="text-slate-700">{preview}</span>
          <button
            type="button"
            aria-label="View item breakdown"
            onMouseEnter={() => {
              if (orderId) setOpenItemsPopoverId(orderId);
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (!orderId) return;
              setOpenItemsPopoverId((current) => (current === orderId ? "" : orderId));
            }}
            className="h-5 w-5 rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 inline-flex items-center justify-center hover:bg-slate-100"
          >
            i
          </button>
        </div>
        <div
          className={`${
            isOpen ? "block" : "hidden"
          } absolute left-0 top-full z-40 mt-2 w-[min(92vw,340px)] rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg lg:left-full lg:top-1/2 lg:mt-0 lg:ml-3 lg:w-[340px] lg:-translate-y-1/2`}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Item Breakdown</div>
          <div className="flex flex-wrap gap-1.5">
            {(items || []).map((it, idx) => {
              const qty = Number(it?.qty || 0);
              const lineTotal = Number(it?.line_total || qty * Number(it?.unit_price || 0));
              return (
                <span
                  key={`${it?.item_id || it?.name || "item"}-${idx}`}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700"
                >
                  {String(it?.name || "Item")} x{qty} • MUR {money(lineTotal)}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">
              Subtotal: MUR {money(subtotal)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
              Tax: MUR {money(tax)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">
              Total: MUR {money(total)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse">
          <div className="h-6 w-52 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-72 rounded bg-slate-100" />
          <div className="mt-6 h-44 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {orderAlert ? (
        <div className="fixed right-4 top-4 z-[95] w-[320px] max-w-[92vw] rounded-2xl border border-[rgba(119,31,168,.35)] bg-[#F4E7D1] p-4 shadow-2xl">
          <div className="text-sm font-semibold text-slate-900">{orderAlert.message}</div>
          <div className="mt-2 text-xs text-slate-700 space-y-1">
            <div>Table: {orderAlert.tableNo}</div>
            <div>Customer: {orderAlert.customerName}</div>
            <div>Amount: MUR {money(orderAlert.totalAmount)}</div>
          </div>
          <button
            type="button"
            onClick={() => setOrderAlert(null)}
            className="mt-3 h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="rounded-2xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-slate-900">Table Orders</div>
            <div className="text-sm text-slate-500 mt-1">
              {restaurantName} • Live incoming table orders
            </div>
          </div>
          {refreshing ? <div className="text-xs text-slate-500">Refreshing...</div> : null}
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!selectedTableNo ? (
          <div className="mt-4 text-xs text-slate-600">
            Tap a table to open its live order details.
          </div>
        ) : (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {["ALL", ...Object.values(STATUS)].map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  activeFilter === f
                    ? "bg-amber-700 text-yellow-50 border-amber-700"
                    : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                }`}
              >
                {f === "ALL" ? "All" : statusLabel(f)} ({counts[f] || 0})
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTableNo ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedTableNo(null)}
              className="h-9 w-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
              aria-label="Back to table grid"
            >
              <ArrowLeft className="h-4 w-4 text-slate-700" />
            </button>
            <div>
              <div className="text-sm font-semibold text-slate-900">Table {selectedTableNo}</div>
              <div className="text-xs text-slate-500">Detailed order view</div>
            </div>
          </div>
        </div>
      ) : null}

      {!selectedTableNo ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 font-semibold">
              Active table
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 font-semibold">
              Empty table
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700 font-semibold">
              Blinking = new/update
            </span>
          </div>
          {tableCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No tables found in layout yet. Configure tables in Table Layout.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {tableCards.map((table) => (
                <button
                  key={`table-card-${table.tableNo}`}
                  type="button"
                  onClick={() => {
                    setBlinkingTables((prev) => {
                      const next = { ...prev };
                      delete next[String(table.tableNo)];
                      return next;
                    });
                    setSelectedTableNo(table.tableNo);
                    setActiveFilter("ALL");
                  }}
                  className={[
                    "relative h-32 rounded-2xl border-2 px-3 py-3 text-left transition cursor-pointer",
                    table.isOccupied
                      ? "border-emerald-500 bg-emerald-50 hover:bg-emerald-100"
                      : "border-slate-300 bg-white hover:bg-slate-50",
                    table.isBlinking ? "table-zoom-blink" : "",
                  ].join(" ")}
                  style={
                    table.isBlinking
                      ? {
                          borderColor: table.blinkColor.ring,
                          boxShadow: `0 0 0 2px ${table.blinkColor.glow}, 0 10px 22px -14px ${table.blinkColor.glow}`,
                        }
                      : undefined
                  }
                >
                  <div className="absolute inset-x-3 top-3 text-xs font-semibold text-slate-500">TABLE</div>
                  <div className="h-full w-full grid place-items-center">
                    <div className="text-3xl font-extrabold text-slate-900">{table.tableNo}</div>
                  </div>
                  <div className="absolute inset-x-3 bottom-3 text-xs font-semibold">
                    <span className={table.isOccupied ? "text-emerald-700" : "text-slate-500"}>
                      {table.isOccupied ? "ORDERING" : "EMPTY"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : orderedList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No orders found.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Live Orders</div>
          </div>

          <div className="hidden lg:block rounded-2xl border border-slate-200 bg-white overflow-visible">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Table</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveOrders.map((o) => {
                  const items = toItems(o.order_items);
                  const draft = draftStatusById[o.id] ?? o.booking_status;
                  const preview = items.length
                    ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1}` : ""}`
                    : o.order_details?.items_summary || "No details";
                  return (
                    <tr key={o.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                        <div className="text-xs text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">T{o.table_no || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800">{o.customer_name || "Guest"}</div>
                        <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                      </td>
                      <td className="px-4 py-3">{renderItemsWithBreakdown(o, items, preview)}</td>
                      <td className="px-4 py-3 text-md text-slate-800 max-w-[220px]">
                        <div className="line-clamp-2">{o.notes || "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{money(o.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                          {statusLabel(o.booking_status)}
                        </span>
                      </td>
                      <td className="px-4 py-1">
                        <div className="flex items-center justify-start gap-2 min-w-[210px]">
                          <select
                            value={draft}
                            disabled={updatingId === o.id}
                            onChange={(e) => onChangeStatus(o, e.target.value)}
                            className="h-9 w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                          >
                            {Object.values(STATUS).map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onCancelDraft(o)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => printBill(o)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Print Bill
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {liveOrders.map((o) => {
              const items = toItems(o.order_items);
              const draft = draftStatusById[o.id] ?? o.booking_status;
              return (
                <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                    </div>
                    <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                      {statusLabel(o.booking_status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Bell className="h-3.5 w-3.5 inline mr-1" />{o.customer_name || "Guest"}</div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Hash className="h-3.5 w-3.5 inline mr-1" />T{o.table_no || "—"}</div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2 col-span-2"><Phone className="h-3.5 w-3.5 inline mr-1" />{o.customer_phone || "—"}</div>
                  </div>

                  <div className="mt-3 text-xs">{renderItemsWithBreakdown(
                    o,
                    items,
                    items.length
                      ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
                      : o.order_details?.items_summary || "No details"
                  )}</div>
                  {o.notes ? (
                    <div className="mt-2 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700">
                      Note: {o.notes}
                    </div>
                  ) : null}
                  <div className="mt-2 text-sm font-semibold text-slate-900">{money(o.total_amount)}</div>

                  <div className="mt-3 flex gap-2">
                    <select
                      value={draft}
                      disabled={updatingId === o.id}
                      onChange={(e) => onChangeStatus(o, e.target.value)}
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                      {Object.values(STATUS).map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onCancelDraft(o)}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => printBill(o)}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Print Bill
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 mt-2">
            <div className="text-sm font-semibold text-slate-900">Completed Orders</div>
          </div>

          {completedOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No completed orders yet.
            </div>
          ) : (
            <>
              <div className="hidden lg:block rounded-2xl border border-slate-200 bg-white overflow-visible">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Order</th>
                      <th className="px-4 py-3 text-left">Table</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Items</th>
                      <th className="px-4 py-3 text-left">Note</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedOrders.map((o) => {
                      const items = toItems(o.order_items);
                      const draft = draftStatusById[o.id] ?? o.booking_status;
                      const preview = items.length
                        ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1}` : ""}`
                        : o.order_details?.items_summary || "No details";
                      return (
                        <tr key={o.id} className="align-top">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                            <div className="text-xs text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">T{o.table_no || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800">{o.customer_name || "Guest"}</div>
                            <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                          </td>
                          <td className="px-4 py-3">{renderItemsWithBreakdown(o, items, preview)}</td>
                          <td className="px-4 py-3 text-md text-slate-800 max-w-[220px]">
                            <div className="line-clamp-2">{o.notes || "—"}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{money(o.total_amount)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                              {statusLabel(o.booking_status)}
                            </span>
                          </td>
                          <td className="px-4 py-1">
                            <div className="flex items-center justify-start gap-2 min-w-[210px]">
                              <select
                                value={draft}
                                disabled={updatingId === o.id}
                                onChange={(e) => onChangeStatus(o, e.target.value)}
                                className="h-9 w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                              >
                                {Object.values(STATUS).map((s) => (
                                  <option key={s} value={s}>
                                    {statusLabel(s)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => onCancelDraft(o)}
                                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                onClick={() => printBill(o)}
                                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Print Bill
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden space-y-3">
                {completedOrders.map((o) => {
                  const items = toItems(o.order_items);
                  const draft = draftStatusById[o.id] ?? o.booking_status;
                  return (
                    <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">#{String(o.id).slice(0, 8)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</div>
                        </div>
                        <span className={`text-xs font-semibold rounded-full border px-2 py-1 ${badgeClass(o.booking_status)}`}>
                          {statusLabel(o.booking_status)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Bell className="h-3.5 w-3.5 inline mr-1" />{o.customer_name || "Guest"}</div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><Hash className="h-3.5 w-3.5 inline mr-1" />T{o.table_no || "—"}</div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2 col-span-2"><Phone className="h-3.5 w-3.5 inline mr-1" />{o.customer_phone || "—"}</div>
                      </div>

                      <div className="mt-3 text-xs">{renderItemsWithBreakdown(
                        o,
                        items,
                        items.length
                          ? `${items[0]?.name || "Item"}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
                          : o.order_details?.items_summary || "No details"
                      )}</div>
                      {o.notes ? (
                        <div className="mt-2 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700">
                          Note: {o.notes}
                        </div>
                      ) : null}
                      <div className="mt-2 text-sm font-semibold text-slate-900">{money(o.total_amount)}</div>

                      <div className="mt-3 flex gap-2">
                        <select
                          value={draft}
                          disabled={updatingId === o.id}
                          onChange={(e) => onChangeStatus(o, e.target.value)}
                          className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                        >
                          {Object.values(STATUS).map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => onCancelDraft(o)}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => printBill(o)}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Print Bill
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      <style jsx global>{`
        @keyframes tableZoomBlink {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }
        .table-zoom-blink {
          animation: tableZoomBlink 760ms ease-in-out infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
