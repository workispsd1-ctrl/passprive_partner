"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ImagePlus, Loader2, RefreshCw, PackagePlus } from "lucide-react";

const BUCKET_NAME = "stores";
const DEFAULT_CATEGORY_TITLE = "Catalogue Images";
const DEFAULT_ITEM_CATEGORY_TITLE = "General Items";

function uid() {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function getExt(file) {
  const byName = file?.name?.split(".").pop()?.toLowerCase();
  if (byName) return byName;
  const byType = file?.type?.split("/")[1]?.toLowerCase();
  return byType || "bin";
}

function isImage(file) {
  return String(file?.type || "").startsWith("image/");
}

function safeNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="font-semibold text-gray-900">{title}</div>
        {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StoreSelector({
  stores,
  applyAll,
  setApplyAll,
  selectedStoreIds,
  setSelectedStoreIds,
  disabled = false,
}) {
  const onToggleStore = (id, checked) => {
    setSelectedStoreIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return Array.from(next);
    });
  };

  return (
    <>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={applyAll}
          disabled={disabled}
          onChange={(e) => setApplyAll(e.target.checked)}
        />
        Apply to all stores ({stores.length})
      </label>

      <div className="max-h-52 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 space-y-2 mt-3">
        {stores.map((s) => {
          const checked = applyAll || selectedStoreIds.includes(String(s.id));
          return (
            <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                disabled={disabled || applyAll}
                checked={checked}
                onChange={(e) => onToggleStore(s.id, e.target.checked)}
              />
              <span>
                {s.name} {s.city ? `• ${s.city}` : ""} {s.is_active === false ? "(Inactive)" : ""}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

export default function CatalogueImagesPage() {
  const router = useRouter();

  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);

  const [savingBulk, setSavingBulk] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);

  // Bulk image mode (gallery-like catalogue images)
  const [applyAllStores, setApplyAllStores] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);
  const [files, setFiles] = useState([]);

  // Individual item mode
  const [applyAllItemStores, setApplyAllItemStores] = useState(false);
  const [selectedItemStoreIds, setSelectedItemStoreIds] = useState([]);
  const [itemTitle, setItemTitle] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCategoryTitle, setItemCategoryTitle] = useState(DEFAULT_ITEM_CATEGORY_TITLE);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemImage, setItemImage] = useState(null);

  // Preview
  const [previewStoreId, setPreviewStoreId] = useState("");
  const [catalogueImages, setCatalogueImages] = useState([]);

  const effectiveStoreIds = useMemo(() => {
    if (applyAllStores) return stores.map((s) => String(s.id));
    return selectedStoreIds;
  }, [applyAllStores, selectedStoreIds, stores]);

  const effectiveItemStoreIds = useMemo(() => {
    if (applyAllItemStores) return stores.map((s) => String(s.id));
    return selectedItemStoreIds;
  }, [applyAllItemStores, selectedItemStoreIds, stores]);

  const canSubmitBulk = useMemo(
    () => effectiveStoreIds.length > 0 && files.length > 0,
    [effectiveStoreIds, files]
  );

  const canSubmitItem = useMemo(() => {
    if (!itemTitle.trim()) return false;
    if (!itemImage) return false;
    if (!effectiveItemStoreIds.length) return false;
    return true;
  }, [itemTitle, itemImage, effectiveItemStoreIds]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingStores(true);
        setErr("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sess?.session?.user?.id;

        if (!userId) {
          router.replace("/sign-in");
          return;
        }

        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name,city,is_active")
          .eq("owner_user_id", userId);
        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id (id,name,city,is_active)")
          .eq("user_id", userId);
        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

        const map = new Map();
        [...ownerStores, ...memberStores].forEach((s) => map.set(String(s.id), s));

        const list = Array.from(map.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!cancelled) {
          setStores(list);
          if (list.length) {
            const firstId = String(list[0].id);
            setSelectedStoreIds([firstId]);
            setSelectedItemStoreIds([firstId]);
            setPreviewStoreId(firstId);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load stores.");
      } finally {
        if (!cancelled) setLoadingStores(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadCatalogueForStore = async (storeId) => {
    if (!storeId) return;
    setLoadingCatalogue(true);
    setErr("");

    try {
      const { data, error } = await supabaseBrowser
        .from("store_catalogue_items")
        .select("id,title,image_url,created_at,sort_order,price")
        .eq("store_id", storeId)
        .not("image_url", "is", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCatalogueImages(data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load catalogue images.");
      setCatalogueImages([]);
    } finally {
      setLoadingCatalogue(false);
    }
  };

  useEffect(() => {
    if (previewStoreId) loadCatalogueForStore(previewStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStoreId]);

  const onPickFiles = (e) => {
    const incoming = Array.from(e.target.files || []);
    const onlyImages = incoming.filter(isImage);
    if (!onlyImages.length) return;

    setFiles((prev) => {
      const map = new Map();
      [...prev, ...onlyImages].forEach((f) => {
        const k = `${f.name}_${f.size}_${f.lastModified}`;
        map.set(k, f);
      });
      return Array.from(map.values());
    });

    e.target.value = "";
  };

  const onPickItemImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !isImage(file)) return;
    setItemImage(file);
    e.target.value = "";
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const uploadImage = async (storeId, file) => {
    const ext = getExt(file);
    const path = `catalogue/${storeId}/${uid()}.${ext}`;

    const { error } = await supabaseBrowser.storage.from(BUCKET_NAME).upload(path, file, {
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabaseBrowser.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
  };

  const ensureCategoryByTitle = async (storeId, title) => {
    const cleanTitle = String(title || "").trim() || DEFAULT_CATEGORY_TITLE;

    const existing = await supabaseBrowser
      .from("store_catalogue_categories")
      .select("id")
      .eq("store_id", storeId)
      .eq("title", cleanTitle)
      .limit(1);

    if (existing.error) throw existing.error;
    if (existing.data?.length) return existing.data[0].id;

    const created = await supabaseBrowser
      .from("store_catalogue_categories")
      .insert({
        store_id: storeId,
        title: cleanTitle,
        enabled: true,
        sort_order: 0,
      })
      .select("id")
      .single();

    if (created.error) throw created.error;
    return created.data.id;
  };

  const getBaseSort = async (storeId) => {
    const { data, error } = await supabaseBrowser
      .from("store_catalogue_items")
      .select("sort_order")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data?.length) return 0;
    return Number(data[0].sort_order || 0) + 1;
  };

  const handleSubmitBulk = async () => {
    if (!canSubmitBulk || savingBulk) return;

    try {
      setSavingBulk(true);
      setErr("");
      setOk("");

      const targets = stores.filter((s) => effectiveStoreIds.includes(String(s.id)));
      if (!targets.length) throw new Error("No stores selected.");

      for (const store of targets) {
        const categoryId = await ensureCategoryByTitle(store.id, DEFAULT_CATEGORY_TITLE);
        let sortBase = await getBaseSort(store.id);

        const rows = [];
        for (const file of files) {
          const imageUrl = await uploadImage(store.id, file);
          rows.push({
            store_id: store.id,
            category_id: categoryId,
            title: `Image ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
            price: null,
            sku: null,
            description: null,
            is_available: true,
            image_url: imageUrl,
            sort_order: sortBase++,
          });
        }

        const { error: insErr } = await supabaseBrowser.from("store_catalogue_items").insert(rows);
        if (insErr) throw insErr;
      }

      setOk(`Uploaded ${files.length} image(s) to ${targets.length} store(s).`);
      setFiles([]);
      if (previewStoreId) loadCatalogueForStore(previewStoreId);
    } catch (e) {
      setErr(e?.message || "Failed to upload catalogue images.");
    } finally {
      setSavingBulk(false);
    }
  };

  const handleSubmitItem = async () => {
    if (!canSubmitItem || savingItem) return;

    try {
      setSavingItem(true);
      setErr("");
      setOk("");

      const targets = stores.filter((s) => effectiveItemStoreIds.includes(String(s.id)));
      if (!targets.length) throw new Error("No stores selected.");

      for (const store of targets) {
        const categoryId = await ensureCategoryByTitle(store.id, itemCategoryTitle || DEFAULT_ITEM_CATEGORY_TITLE);
        const sortOrder = await getBaseSort(store.id);
        const imageUrl = await uploadImage(store.id, itemImage);

        const row = {
          store_id: store.id,
          category_id: categoryId,
          title: itemTitle.trim(),
          price: safeNum(itemPrice),
          sku: itemSku.trim() || null,
          description: itemDescription.trim() || null,
          is_available: !!itemAvailable,
          image_url: imageUrl,
          sort_order: sortOrder,
        };

        const { error } = await supabaseBrowser.from("store_catalogue_items").insert(row);
        if (error) throw error;
      }

      setOk(`Added item "${itemTitle.trim()}" to ${targets.length} store(s).`);
      setItemTitle("");
      setItemPrice("");
      setItemSku("");
      setItemDescription("");
      setItemCategoryTitle(DEFAULT_ITEM_CATEGORY_TITLE);
      setItemAvailable(true);
      setItemImage(null);

      if (previewStoreId) loadCatalogueForStore(previewStoreId);
    } catch (e) {
      setErr(e?.message || "Failed to add item.");
    } finally {
      setSavingItem(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        <Card
          title="Upload Catalogue Images (Gallery Mode)"
          subtitle="Upload images only. Items are auto-created under 'Catalogue Images'."
        >
          {loadingStores ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse space-y-3">
              <div className="h-5 w-56 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-32 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <StoreSelector
                  stores={stores}
                  applyAll={applyAllStores}
                  setApplyAll={setApplyAllStores}
                  selectedStoreIds={selectedStoreIds}
                  setSelectedStoreIds={setSelectedStoreIds}
                  disabled={savingBulk}
                />

                <div className="space-y-2 mt-4">
                  <label
                    htmlFor="catalogue-image-input"
                    className="h-11 px-4 rounded-full border border-gray-200 bg-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-gray-50"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Select Images
                  </label>
                  <input
                    id="catalogue-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onPickFiles}
                    className="hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmitBulk}
                  disabled={!canSubmitBulk || savingBulk || loadingStores}
                  className="mt-4 h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                  style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
                >
                  {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Upload To Catalogue
                </button>

                {files.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {files.map((file, idx) => (
                      <div key={`${file.name}_${file.size}_${idx}`} className="rounded-2xl border border-gray-200 bg-white p-2">
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                          <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="mt-2 h-8 w-full rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 mt-4">
                    No images selected.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">How this looks on the app</div>
                  <button
                    type="button"
                    onClick={() => previewStoreId && loadCatalogueForStore(previewStoreId)}
                    className="h-9 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingCatalogue ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                <select
                  value={previewStoreId}
                  onChange={(e) => setPreviewStoreId(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {loadingCatalogue ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 animate-pulse">
                    <div className="h-40 rounded-xl bg-gray-100 border border-gray-200" />
                  </div>
                ) : catalogueImages.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {catalogueImages.map((it) => (
                      <div key={it.id} className="rounded-2xl border border-gray-200 bg-white p-2">
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                          <img src={it.image_url} alt={it.title || "catalogue"} className="h-full w-full object-cover" />
                        </div>
                        <div className="mt-2 text-xs text-gray-700 truncate">{it.title || "Untitled"}</div>
                        {it.price !== null && it.price !== undefined ? (
                          <div className="text-[11px] text-gray-500">MUR {it.price}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No catalogue images/items found for this store.
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Catalogue for Pick and Collect Service"
          subtitle="This will enable you to create individual catalogue items that customer can order for ‘pick and collect’ as a service."
        >
          {loadingStores ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse space-y-3">
              <div className="h-5 w-56 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-32 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <StoreSelector
                  stores={stores}
                  applyAll={applyAllItemStores}
                  setApplyAll={setApplyAllItemStores}
                  selectedStoreIds={selectedItemStoreIds}
                  setSelectedStoreIds={setSelectedItemStoreIds}
                  disabled={savingItem}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Item Title *</div>
                    <input
                      value={itemTitle}
                      onChange={(e) => setItemTitle(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                      placeholder="e.g. Classic Chicken Burger"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">Price (MUR)</div>
                    <input
                      type="number"
                      min="0"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                      placeholder="e.g. 250"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">SKU</div>
                    <input
                      value={itemSku}
                      onChange={(e) => setItemSku(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                      placeholder="e.g. BRG-001"
                    />
                  </div>

                  {/* Image upload and description below */}
                  <div className="md:col-span-2 mt-4">
                    {files.length ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                        {files.map((file, idx) => (
                          <div key={`${file.name}_${file.size}_${idx}`} className="rounded-2xl border border-gray-200 bg-white p-2">
                            <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                              <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="mt-2 h-8 w-full rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 mt-4">
                        No images selected.
                      </div>
                    )}
                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-gray-600 mb-2">Description</label>
                      <textarea
                        className="min-h-[80px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-300"
                        placeholder="Add a description for your catalogue image..."
                        value={itemDescription}
                        onChange={e => setItemDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={itemAvailable}
                        onChange={(e) => setItemAvailable(e.target.checked)}
                      />
                      Item available
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitItem}
                  disabled={!canSubmitItem || savingItem}
                  className="mt-4 h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                  style={{ background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)" }}
                >
                  {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                  Add Item
                </button>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">Item Image *</div>
                <label
                  htmlFor="item-image-input"
                  className="h-11 px-4 rounded-full border border-gray-200 bg-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-gray-50"
                >
                  <ImagePlus className="h-4 w-4" />
                  Select Item Image
                </label>
                <input
                  id="item-image-input"
                  type="file"
                  accept="image/*"
                  onChange={onPickItemImage}
                  className="hidden"
                />

                {itemImage ? (
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                      <img src={URL.createObjectURL(itemImage)} alt="item preview" className="h-full w-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setItemImage(null)}
                      className="mt-3 h-9 w-full rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50"
                    >
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No item image selected.
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
