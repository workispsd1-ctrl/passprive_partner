"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Plus,
  Minus,
  AlertTriangle,
  PackageCheck,
  PackageX,
  History,
} from "lucide-react";

const IMAGE_ONLY_CATEGORY_TITLE = "Catalogue Images";

function stockStatusFromQty(qty, lowThreshold = 5) {
  const q = Number(qty || 0);
  const low = Number(lowThreshold || 5);
  if (q <= 0) return "out_of_stock";
  if (q <= low) return "low_stock";
  return "in_stock";
}

function statusBadgeClass(status) {
  if (status === "out_of_stock") return "bg-red-100 text-red-700 border-red-200";
  if (status === "low_stock") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function movementBadgeClass(type) {
  if (type === "INCREASE") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (type === "DECREASE") return "bg-amber-100 text-amber-700 border-amber-200";
  if (type === "STOCKOUT") return "bg-red-100 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function money(v) {
  const n = Number(v || 0);
  return `MUR ${n.toLocaleString()}`;
}

function Card({ title, subtitle, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
        </div>
        {right || null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function InventoryPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingItemId, setSavingItemId] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [movements, setMovements] = useState([]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const selectedItem = useMemo(
    () => items.find((i) => String(i.id) === String(selectedItemId)) || null,
    [items, selectedItemId]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const computedStatus = i.stock_status || stockStatusFromQty(i.stock_qty, i.low_stock_threshold);
      if (statusFilter !== "ALL" && computedStatus !== statusFilter) return false;
      if (showLowOnly && computedStatus !== "low_stock") return false;
      if (!q) return true;
      const hay = `${i.title || ""} ${i.sku || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, statusFilter, showLowOnly]);

  const metrics = useMemo(() => {
    const total = filteredItems.length;
    const low = filteredItems.filter(
      (i) => (i.stock_status || stockStatusFromQty(i.stock_qty, i.low_stock_threshold)) === "low_stock"
    ).length;
    const out = filteredItems.filter(
      (i) => (i.stock_status || stockStatusFromQty(i.stock_qty, i.low_stock_threshold)) === "out_of_stock"
    ).length;
    const stockValue = filteredItems.reduce(
      (acc, i) => acc + Number(i.price || 0) * Number(i.stock_qty || 0),
      0
    );
    return { total, low, out, stockValue };
  }, [filteredItems]);

  const loadStores = async (uid) => {
    const ownerRes = await supabaseBrowser
      .from("stores")
      .select("id,name,city")
      .eq("owner_user_id", uid);

    if (ownerRes.error) throw ownerRes.error;

    const memberRes = await supabaseBrowser
      .from("store_members")
      .select("store_id, stores:store_id(id,name,city)")
      .eq("user_id", uid);

    if (memberRes.error) throw memberRes.error;

    const ownerStores = ownerRes.data || [];
    const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

    const map = new Map();
    [...ownerStores, ...memberStores].forEach((s) => map.set(String(s.id), s));

    const list = Array.from(map.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    setStores(list);

    if (list.length && !selectedStoreId) setSelectedStoreId(String(list[0].id));
    if (!list.length) setSelectedStoreId("");
  };

  const loadItems = async (storeId) => {
    if (!storeId) {
      setItems([]);
      setSelectedItemId("");
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("store_catalogue_items")
      .select(
        "id,store_id,title,sku,price,track_inventory,is_available,stock_qty,low_stock_threshold,stock_status,sold_count,reserved_count,updated_at,category:category_id(title)"
      )
      .eq("store_id", storeId)
      .eq("track_inventory", true)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const rows = (data || [])
      .filter((r) => (r?.category?.title || "") !== IMAGE_ONLY_CATEGORY_TITLE)
      .map((r) => ({
        ...r,
        stock_qty: Number(r.stock_qty ?? 0),
        low_stock_threshold: Number(r.low_stock_threshold ?? 5),
        sold_count: Number(r.sold_count ?? 0),
        reserved_count: Number(r.reserved_count ?? 0),
        stock_status: r.stock_status || stockStatusFromQty(r.stock_qty, r.low_stock_threshold),
      }));

    setItems(rows);

    const exists = rows.some((r) => String(r.id) === String(selectedItemId));
    if (!exists) setSelectedItemId(rows[0]?.id || "");
  };

  const loadMovements = async (storeId, itemId) => {
    if (!storeId || !itemId) {
      setMovements([]);
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("store_catalogue_stock_movements")
      .select("id,movement_type,qty_delta,qty_before,qty_after,reason,created_at")
      .eq("store_id", storeId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    setMovements(data || []);
  };

  const reloadAll = async (silent = false) => {
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

      setUserId(uid);
      await loadStores(uid);
    } catch (e) {
      setErr(e?.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    reloadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    (async () => {
      try {
        await loadItems(selectedStoreId);
      } catch (e) {
        setErr(e?.message || "Failed to load inventory items.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId || !selectedItemId) {
      setMovements([]);
      return;
    }
    (async () => {
      try {
        await loadMovements(selectedStoreId, selectedItemId);
      } catch (e) {
        setErr(e?.message || "Failed to load stock movements.");
      }
    })();
  }, [selectedStoreId, selectedItemId]);

  useEffect(() => {
    if (!selectedStoreId) return;

    const channel = supabaseBrowser
      .channel(`inventory-live-${selectedStoreId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_catalogue_items", filter: `store_id=eq.${selectedStoreId}` },
        async () => {
          await loadItems(selectedStoreId);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const applyStockChange = async (item, nextQty, movementType, reason) => {
    const qtyBefore = Number(item.stock_qty || 0);
    const qtyAfter = Math.max(0, Number(nextQty || 0));
    const low = Number(item.low_stock_threshold || 5);
    const nextStatus = stockStatusFromQty(qtyAfter, low);

    const updatePayload = {
      stock_qty: qtyAfter,
      stock_status: nextStatus,
      is_available: nextStatus !== "out_of_stock",
    };

    const movementPayload = {
      store_id: item.store_id,
      item_id: item.id,
      movement_type: movementType,
      qty_delta: qtyAfter - qtyBefore,
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      reason,
      actor_user_id: userId || null,
    };

    const { error: upErr } = await supabaseBrowser
      .from("store_catalogue_items")
      .update(updatePayload)
      .eq("id", item.id);

    if (upErr) throw upErr;

    const { error: mvErr } = await supabaseBrowser
      .from("store_catalogue_stock_movements")
      .insert(movementPayload);

    if (mvErr) throw mvErr;

    setItems((prev) =>
      prev.map((r) =>
        String(r.id) === String(item.id)
          ? { ...r, ...updatePayload }
          : r
      )
    );

    if (String(selectedItemId) === String(item.id)) {
      setMovements((prev) => [
        {
          ...movementPayload,
          id: uid(),
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  const updateStockDelta = async (item, delta) => {
    if (savingItemId) return;
    try {
      setSavingItemId(String(item.id));
      setErr("");
      setOk("");

      const nextQty = Math.max(0, Number(item.stock_qty || 0) + Number(delta || 0));
      const movementType = delta > 0 ? "INCREASE" : "DECREASE";

      await applyStockChange(item, nextQty, movementType, "Manual adjustment from inventory page");
      setOk(`Stock updated for ${item.title}.`);
    } catch (e) {
      setErr(e?.message || "Failed to update stock.");
    } finally {
      setSavingItemId("");
    }
  };

  const setStockOut = async (item) => {
    if (savingItemId) return;
    try {
      setSavingItemId(String(item.id));
      setErr("");
      setOk("");

      await applyStockChange(item, 0, "STOCKOUT", "Marked stockout from inventory page");
      setOk(`Marked ${item.title} as out of stock.`);
    } catch (e) {
      setErr(e?.message || "Failed to mark stockout.");
    } finally {
      setSavingItemId("");
    }
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-7xl px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
         
          <div></div>

          <button
            type="button"
            onClick={() => reloadAll(true)}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2 cursor-pointer"
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
          <>
            <Card title="Inventory Overview" subtitle="Track stock in real time across your catalogue items">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-xs text-gray-500">Items</div>
                  <div className="text-xl font-semibold text-gray-900 mt-1">{metrics.total}</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs text-amber-700">Low Stock</div>
                  <div className="text-xl font-semibold text-amber-800 mt-1">{metrics.low}</div>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="text-xs text-red-700">Out of Stock</div>
                  <div className="text-xl font-semibold text-red-800 mt-1">{metrics.out}</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs text-emerald-700">Stock Value</div>
                  <div className="text-xl font-semibold text-emerald-800 mt-1">{money(metrics.stockValue)}</div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
              <Card
                title="Inventory Table"
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedStoreId}
                      onChange={(e) => setSelectedStoreId(e.target.value)}
                      className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.city ? `• ${s.city}` : ""}
                        </option>
                      ))}
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"
                    >
                      <option value="ALL">All Status</option>
                      <option value="in_stock">In Stock</option>
                      <option value="low_stock">Low Stock</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </div>
                }
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="h-10 flex-1 min-w-[220px] rounded-xl border border-gray-200 px-3 bg-white inline-flex items-center gap-2">
                    <Search className="h-4 w-4 text-gray-500" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by title or SKU"
                      className="w-full text-sm outline-none"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={showLowOnly}
                      onChange={(e) => setShowLowOnly(e.target.checked)}
                    />
                    Low stock only
                  </label>
                </div>

                {!filteredItems.length ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                    No inventory items found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">Item</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">SKU</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">Price</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">Stock</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">Status</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((row) => {
                          const status = row.stock_status || stockStatusFromQty(row.stock_qty, row.low_stock_threshold);
                          const active = String(selectedItemId) === String(row.id);

                          return (
                            <tr
                              key={row.id}
                              className={`border-b border-gray-100 cursor-pointer ${active ? "bg-orange-50/40" : ""}`}
                              onClick={() => setSelectedItemId(String(row.id))}
                            >
                              <td className="px-4 py-2">
                                <div className="font-medium text-gray-900">{row.title}</div>
                                <div className="text-[11px] text-gray-500">
                                  Reserved: {row.reserved_count || 0} • Sold: {row.sold_count || 0}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-gray-600">{row.sku || "—"}</td>
                              <td className="px-4 py-2 text-gray-600">{row.price ?? "—"}</td>
                              <td className="px-4 py-2 font-semibold text-gray-900">{Number(row.stock_qty || 0)}</td>
                              <td className="px-4 py-2">
                                <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", statusBadgeClass(status)].join(" ")}>
                                  {status.replaceAll("_", " ")}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStockDelta(row, -1);
                                    }}
                                    disabled={savingItemId === String(row.id)}
                                    className="h-7 w-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStockDelta(row, 1);
                                    }}
                                    disabled={savingItemId === String(row.id)}
                                    className="h-7 w-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setStockOut(row);
                                    }}
                                    disabled={savingItemId === String(row.id)}
                                    className="h-7 rounded-lg border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                                  >
                                    Out
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card
                title="Stock Movement Timeline"
                subtitle="Recent adjustments for selected item"
                right={
                  selectedItem ? (
                    <div className="text-xs text-gray-500">
                      {selectedItem.title}
                    </div>
                  ) : null
                }
              >
                {!selectedItem ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                    Select an item from the table.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{selectedItem.title}</div>
                        <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", statusBadgeClass(selectedItem.stock_status || stockStatusFromQty(selectedItem.stock_qty, selectedItem.low_stock_threshold))].join(" ")}>
                          {(selectedItem.stock_status || stockStatusFromQty(selectedItem.stock_qty, selectedItem.low_stock_threshold)).replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg border border-gray-200 bg-white p-2">
                          <div className="text-gray-500">Current</div>
                          <div className="font-semibold text-gray-900">{selectedItem.stock_qty || 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-2">
                          <div className="text-gray-500">Threshold</div>
                          <div className="font-semibold text-gray-900">{selectedItem.low_stock_threshold || 5}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-2">
                          <div className="text-gray-500">Value</div>
                          <div className="font-semibold text-gray-900">
                            {money((selectedItem.price || 0) * (selectedItem.stock_qty || 0))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!movements.length ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                        No movement history yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {movements.map((m) => (
                          <div key={m.id} className="rounded-xl border border-gray-200 p-3 bg-white">
                            <div className="flex items-center justify-between gap-2">
                              <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", movementBadgeClass(m.movement_type)].join(" ")}>
                                {m.movement_type}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(m.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-700 inline-flex items-center gap-2">
                              <History className="h-3.5 w-3.5" />
                              Delta: {m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta} • {m.qty_before ?? 0} → {m.qty_after ?? 0}
                            </div>
                            {m.reason ? <div className="mt-1 text-xs text-gray-500">{m.reason}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 inline-flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      Tip: when orders are marked as collected in Pickup Orders, stock should decrease automatically and appear here.
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => selectedItem && updateStockDelta(selectedItem, 1)}
                        disabled={!selectedItem || savingItemId === String(selectedItem?.id)}
                        className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        Increase
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedItem && updateStockDelta(selectedItem, -1)}
                        disabled={!selectedItem || savingItemId === String(selectedItem?.id)}
                        className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1"
                      >
                        <Minus className="h-3.5 w-3.5" />
                        Decrease
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedItem && setStockOut(selectedItem)}
                        disabled={!selectedItem || savingItemId === String(selectedItem?.id)}
                        className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 inline-flex items-center gap-1"
                      >
                        <PackageX className="h-3.5 w-3.5" />
                        Stockout
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
