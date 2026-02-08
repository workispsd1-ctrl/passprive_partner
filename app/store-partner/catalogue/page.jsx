"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ArrowLeft, ImagePlus, Loader2, RefreshCw } from "lucide-react";

const BUCKET_NAME = "stores"; 
const DEFAULT_CATEGORY_TITLE = "Catalogue Images";

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

export default function CatalogueImagesPage() {
  const router = useRouter();

  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);
  const [applyAllStores, setApplyAllStores] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);
  const [previewStoreId, setPreviewStoreId] = useState("");

  const [files, setFiles] = useState([]);
  const [catalogueImages, setCatalogueImages] = useState([]);

  const effectiveStoreIds = useMemo(() => {
    if (applyAllStores) return stores.map((s) => String(s.id));
    return selectedStoreIds;
  }, [applyAllStores, selectedStoreIds, stores]);

  const canSubmit = useMemo(() => {
    return effectiveStoreIds.length > 0 && files.length > 0;
  }, [effectiveStoreIds, files]);

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

        // owner stores
        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name,city,is_active")
          .eq("owner_user_id", userId);
        if (ownerRes.error) throw ownerRes.error;

        // member stores
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
            setSelectedStoreIds([String(list[0].id)]);
            setPreviewStoreId(String(list[0].id));
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
        .select("id,image_url,created_at,sort_order")
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

  const onToggleStore = (id, checked) => {
    setSelectedStoreIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      const arr = Array.from(next);
      if (!previewStoreId && arr.length) setPreviewStoreId(arr[0]);
      return arr;
    });
  };

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

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

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

  const ensureDefaultCategory = async (storeId) => {
    const existing = await supabaseBrowser
      .from("store_catalogue_categories")
      .select("id")
      .eq("store_id", storeId)
      .eq("title", DEFAULT_CATEGORY_TITLE)
      .limit(1);

    if (existing.error) throw existing.error;
    if (existing.data?.length) return existing.data[0].id;

    const created = await supabaseBrowser
      .from("store_catalogue_categories")
      .insert({
        store_id: storeId,
        title: DEFAULT_CATEGORY_TITLE,
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

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      setErr("");
      setOk("");

      const targets = stores.filter((s) => effectiveStoreIds.includes(String(s.id)));
      if (!targets.length) throw new Error("No stores selected.");

      for (const store of targets) {
        const categoryId = await ensureDefaultCategory(store.id);
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
      setSaving(false);
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
        <div className="flex items-center justify-between gap-3">
         <div>
          
         </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving || loadingStores}
            className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
            style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Upload To Catalogue
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        <Card
          title="Catalogue Images"
          subtitle="Upload images to one store, multiple stores, or all stores."
        >
          {loadingStores ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse space-y-3">
              <div className="h-5 w-56 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-32 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={applyAllStores}
                    onChange={(e) => setApplyAllStores(e.target.checked)}
                  />
                  Apply to all stores ({stores.length})
                </label>

                <div className="max-h-52 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
                  {stores.map((s) => {
                    const checked = applyAllStores || selectedStoreIds.includes(String(s.id));
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          disabled={applyAllStores}
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

                <div className="space-y-2">
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

                {files.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {files.map((file, idx) => (
                      <div key={`${file.name}_${file.size}_${idx}`} className="rounded-2xl border border-gray-200 bg-white p-2">
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-full w-full object-cover"
                          />
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
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No images selected.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Catalogue Preview</div>
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
                          <img src={it.image_url} alt="catalogue" className="h-full w-full object-cover" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No catalogue images found for this store.
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
