"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ImagePlus,
  Loader2,
  RefreshCw,
  PackagePlus,
  Crown,
  AlertTriangle,
  X,
  CalendarClock,
  Save,
} from "lucide-react";

const BUCKET_NAME = "stores";
const DEFAULT_CATEGORY_TITLE = "Catalogue Images";
const DEFAULT_ITEM_CATEGORY_TITLE = "General Items";

const DEMO_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12/34",
  cvv: "123",
};

const PICKUP_PREMIUM_PLAN = {
  code: "PICKUP_PREMIUM",
  name: "PickUp Orders Premium",
  priceMonthly: 2000,
};

const WEEK_DAYS = [
  { key: "MON", label: "Mon" },
  { key: "TUE", label: "Tue" },
  { key: "WED", label: "Wed" },
  { key: "THU", label: "Thu" },
  { key: "FRI", label: "Fri" },
  { key: "SAT", label: "Sat" },
  { key: "SUN", label: "Sun" },
];

const STORE_ID_STORAGE_KEYS = [
  "store_partner_selected_store_id",
  "selectedStoreId",
  "activeStoreId",
  "storeId",
];

function uid() {
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

function normalizeCardNumber(v) {
  return String(v || "").replace(/\D/g, "");
}
function formatCardNumber(v) {
  const digits = normalizeCardNumber(v).slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(v) {
  const digits = String(v || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
function formatCvv(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 4);
}

function stockStatusFromQty(qty, lowThreshold = 5) {
  const n = Number(qty || 0);
  const low = Number(lowThreshold || 5);
  if (n <= 0) return "out_of_stock";
  if (n <= low) return "low_stock";
  return "in_stock";
}

function isPremiumActive(store) {
  if (!store?.pickup_premium_enabled) return false;
  if (!store?.pickup_premium_expires_at) return true;
  const ts = new Date(store.pickup_premium_expires_at).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function readPreferredStoreId() {
  if (typeof window === "undefined") return "";
  for (const key of STORE_ID_STORAGE_KEYS) {
    const v = window.localStorage.getItem(key);
    if (v) return String(v);
  }
  return "";
}

function savePreferredStoreId(id) {
  if (typeof window === "undefined" || !id) return;
  for (const key of STORE_ID_STORAGE_KEYS) {
    window.localStorage.setItem(key, String(id));
  }
}

function normalizeMemberStore(storesField) {
  if (Array.isArray(storesField)) return storesField[0] || null;
  return storesField || null;
}

function Card({ title, subtitle, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
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

function SectionSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-52 rounded bg-gray-100" />
      <div className="h-11 w-full rounded-xl bg-gray-100" />
      <div className="h-28 w-full rounded-xl bg-gray-100" />
      <div className="h-11 w-44 rounded-full bg-gray-100" />
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

function PremiumModal({
  open,
  onClose,
  onConfirm,
  loading,
  cardName,
  setCardName,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  cardCvv,
  setCardCvv,
  error,
  targetCount,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">Subscribe PickUp Premium</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-semibold text-amber-900">
              {PICKUP_PREMIUM_PLAN.name} • Rs. {PICKUP_PREMIUM_PLAN.priceMonthly}/month
            </div>
            <ul className="mt-2 text-xs text-amber-800 list-disc pl-5 space-y-1">
              <li>Item-level PickUp catalogue with live stock control.</li>
              <li>Scheduled slot configuration for salon/services and timed collection.</li>
              <li>Operational inventory controls across selected stores.</li>
              <li>Applies to {targetCount} selected store(s).</li>
            </ul>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            Demo card: {DEMO_CARD.number} | {DEMO_CARD.expiry} | {DEMO_CARD.cvv}
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div>
            <label className="text-sm font-semibold text-gray-700">Cardholder Name</label>
            <input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Demo User"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Card Number</label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Expiry</label>
              <input
                value={cardExpiry}
                onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                placeholder="12/34"
                inputMode="numeric"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">CVV</label>
              <input
                value={cardCvv}
                onChange={(e) => setCardCvv(formatCvv(e.target.value))}
                placeholder="123"
                inputMode="numeric"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-9 rounded-xl bg-[#DA3224] text-white px-4 text-sm font-medium hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Processing..." : "Pay & Subscribe"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CatalogueImagesPage() {
  const router = useRouter();

  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [savingBulk, setSavingBulk] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);

  const [applyAllStores, setApplyAllStores] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);
  const [files, setFiles] = useState([]);

  const [applyAllItemStores, setApplyAllItemStores] = useState(false);
  const [selectedItemStoreIds, setSelectedItemStoreIds] = useState([]);
  const [itemTitle, setItemTitle] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCategoryTitle, setItemCategoryTitle] = useState(DEFAULT_ITEM_CATEGORY_TITLE);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemImage, setItemImage] = useState(null);
  const [itemInitialStock, setItemInitialStock] = useState("0");
  const [itemLowThreshold, setItemLowThreshold] = useState("5");

  const [previewStoreId, setPreviewStoreId] = useState("");
  const [catalogueImages, setCatalogueImages] = useState([]);

  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumError, setPremiumError] = useState("");
  const [premiumSaving, setPremiumSaving] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [slotEnabled, setSlotEnabled] = useState(false);
  const [slotMode, setSlotMode] = useState("OPTIONAL");
  const [slotDuration, setSlotDuration] = useState("30");
  const [slotBuffer, setSlotBuffer] = useState("0");
  const [slotAdvanceDays, setSlotAdvanceDays] = useState("30");
  const [slotMaxPerWindow, setSlotMaxPerWindow] = useState("1");
  const [slotDays, setSlotDays] = useState(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotEnd, setSlotEnd] = useState("19:00");

  const storeMap = useMemo(() => {
    const m = new Map();
    stores.forEach((s) => m.set(String(s.id), s));
    return m;
  }, [stores]);

  const effectiveStoreIds = useMemo(() => {
    if (applyAllStores) return stores.map((s) => String(s.id));
    return selectedStoreIds;
  }, [applyAllStores, selectedStoreIds, stores]);

  const effectiveItemStoreIds = useMemo(() => {
    if (applyAllItemStores) return stores.map((s) => String(s.id));
    return selectedItemStoreIds;
  }, [applyAllItemStores, selectedItemStoreIds, stores]);

  const selectedPreviewStore = useMemo(
    () => storeMap.get(String(previewStoreId)) || null,
    [storeMap, previewStoreId]
  );

  const previewStorePremiumUnlocked = useMemo(
    () => isPremiumActive(selectedPreviewStore),
    [selectedPreviewStore]
  );

  const targetPremiumStoreIds = useMemo(() => {
    return effectiveItemStoreIds.filter((id) => !isPremiumActive(storeMap.get(String(id))));
  }, [effectiveItemStoreIds, storeMap]);

  const pickupPremiumUnlockedForSelection = useMemo(
    () => effectiveItemStoreIds.length > 0 && targetPremiumStoreIds.length === 0,
    [effectiveItemStoreIds, targetPremiumStoreIds]
  );

  const canSubmitBulk = useMemo(
    () => effectiveStoreIds.length > 0 && files.length > 0,
    [effectiveStoreIds, files]
  );

  const canSubmitItem = useMemo(() => {
    if (!itemTitle.trim()) return false;
    if (!itemImage) return false;
    if (!effectiveItemStoreIds.length) return false;
    if (!pickupPremiumUnlockedForSelection) return false;
    return true;
  }, [itemTitle, itemImage, effectiveItemStoreIds, pickupPremiumUnlockedForSelection]);

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
          .select("id,name,city,is_active,pickup_premium_enabled,pickup_premium_plan,pickup_premium_expires_at,metadata")
          .eq("owner_user_id", userId);
        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select(
            "store_id, stores:store_id (id,name,city,is_active,pickup_premium_enabled,pickup_premium_plan,pickup_premium_expires_at,metadata)"
          )
          .eq("user_id", userId);
        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || [])
          .map((r) => normalizeMemberStore(r.stores))
          .filter(Boolean);

        const map = new Map();
        [...ownerStores, ...memberStores].forEach((s) => map.set(String(s.id), s));

        const list = Array.from(map.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!cancelled) {
          setStores(list);

          if (list.length) {
            const preferred = readPreferredStoreId();
            const picked =
              list.find((s) => String(s.id) === String(preferred))?.id ?? list[0].id;
            const pickedId = String(picked);

            setPreviewStoreId(pickedId);
            setSelectedStoreIds([pickedId]);
            setSelectedItemStoreIds([pickedId]);
            savePreferredStoreId(pickedId);
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

  useEffect(() => {
    if (!previewStoreId) return;
    savePreferredStoreId(previewStoreId);

    if (!applyAllStores) setSelectedStoreIds([String(previewStoreId)]);
    if (!applyAllItemStores) setSelectedItemStoreIds([String(previewStoreId)]);
  }, [previewStoreId, applyAllStores, applyAllItemStores]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncStoreFromSidebar = () => {
      const preferred = readPreferredStoreId();
      if (!preferred) return;
      const exists = stores.some((s) => String(s.id) === String(preferred));
      if (!exists) return;
      if (String(preferred) !== String(previewStoreId)) {
        setPreviewStoreId(String(preferred));
      }
    };

    window.addEventListener("focus", syncStoreFromSidebar);
    window.addEventListener("storage", syncStoreFromSidebar);

    return () => {
      window.removeEventListener("focus", syncStoreFromSidebar);
      window.removeEventListener("storage", syncStoreFromSidebar);
    };
  }, [stores, previewStoreId]);

  useEffect(() => {
    const store = storeMap.get(String(previewStoreId));
    const sched = store?.metadata?.pickupScheduling || {};

    setSlotEnabled(Boolean(sched?.enabled));
    setSlotMode(sched?.mode === "REQUIRED" ? "REQUIRED" : "OPTIONAL");
    setSlotDuration(String(sched?.slotDurationMinutes ?? 30));
    setSlotBuffer(String(sched?.slotBufferMinutes ?? 0));
    setSlotAdvanceDays(String(sched?.advanceBookingDays ?? 30));
    setSlotMaxPerWindow(String(sched?.maxPerSlot ?? 1));
    setSlotDays(
      Array.isArray(sched?.days) && sched.days.length
        ? sched.days
        : ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
    );
    setSlotStart(sched?.startTime || "09:00");
    setSlotEnd(sched?.endTime || "19:00");
  }, [previewStoreId, storeMap]);

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
            track_inventory: false,
            stock_qty: null,
            low_stock_threshold: 5,
            stock_status: null,
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

  const toggleSlotDay = (day) => {
    setSlotDays((prev) => {
      const has = prev.includes(day);
      if (has) return prev.filter((d) => d !== day);
      return [...prev, day];
    });
  };

  const saveSchedulingConfig = async () => {
    if (!previewStoreId) return;
    try {
      setSavingSchedule(true);
      setErr("");
      setOk("");

      const store = storeMap.get(String(previewStoreId));
      const existingMetadata = store?.metadata || {};

      const pickupScheduling = {
        enabled: Boolean(slotEnabled),
        mode: slotMode === "REQUIRED" ? "REQUIRED" : "OPTIONAL",
        slotDurationMinutes: Math.max(5, Number(slotDuration || 30)),
        slotBufferMinutes: Math.max(0, Number(slotBuffer || 0)),
        advanceBookingDays: Math.max(1, Number(slotAdvanceDays || 30)),
        maxPerSlot: Math.max(1, Number(slotMaxPerWindow || 1)),
        days: slotDays.length ? slotDays : ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
        startTime: slotStart || "09:00",
        endTime: slotEnd || "19:00",
        updatedAt: new Date().toISOString(),
      };

      const nextMetadata = { ...existingMetadata, pickupScheduling };

      const { error } = await supabaseBrowser
        .from("stores")
        .update({ metadata: nextMetadata })
        .eq("id", previewStoreId);

      if (error) throw error;

      setStores((prev) =>
        prev.map((s) => (String(s.id) === String(previewStoreId) ? { ...s, metadata: nextMetadata } : s))
      );

      setOk("Scheduling configuration saved.");
    } catch (e) {
      setErr(e?.message || "Failed to save scheduling configuration.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const openPremiumModal = () => {
    setPremiumError("");
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setPremiumModalOpen(true);
  };

  const handleSubscribePremium = async () => {
    setPremiumError("");

    const isDemoNumber = normalizeCardNumber(cardNumber) === normalizeCardNumber(DEMO_CARD.number);
    const isDemoExpiry = cardExpiry === DEMO_CARD.expiry;
    const isDemoCvv = cardCvv === DEMO_CARD.cvv;

    if (!cardName.trim()) {
      setPremiumError("Enter cardholder name.");
      return;
    }
    if (!isDemoNumber || !isDemoExpiry || !isDemoCvv) {
      setPremiumError("Use demo card details exactly as shown.");
      return;
    }

    try {
      setPremiumSaving(true);

      const ids = targetPremiumStoreIds;
      if (!ids.length) {
        setPremiumModalOpen(false);
        return;
      }

      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { error } = await supabaseBrowser
        .from("stores")
        .update({
          pickup_premium_enabled: true,
          pickup_premium_plan: PICKUP_PREMIUM_PLAN.code,
          pickup_premium_started_at: now.toISOString(),
          pickup_premium_expires_at: nextMonth.toISOString(),
        })
        .in("id", ids);

      if (error) throw error;

      setStores((prev) =>
        prev.map((s) =>
          ids.includes(String(s.id))
            ? {
                ...s,
                pickup_premium_enabled: true,
                pickup_premium_plan: PICKUP_PREMIUM_PLAN.code,
                pickup_premium_started_at: now.toISOString(),
                pickup_premium_expires_at: nextMonth.toISOString(),
              }
            : s
        )
      );

      setOk(`Premium activated for ${ids.length} store(s).`);
      setPremiumModalOpen(false);
    } catch (e) {
      setPremiumError(e?.message || "Failed to activate premium.");
    } finally {
      setPremiumSaving(false);
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

      const initialStock = Math.max(0, Number(itemInitialStock || 0));
      const lowThreshold = Math.max(0, Number(itemLowThreshold || 5));

      for (const store of targets) {
        const categoryId = await ensureCategoryByTitle(store.id, itemCategoryTitle || DEFAULT_ITEM_CATEGORY_TITLE);
        const sortOrder = await getBaseSort(store.id);
        const imageUrl = await uploadImage(store.id, itemImage);

        const status = stockStatusFromQty(initialStock, lowThreshold);

        const row = {
          store_id: store.id,
          category_id: categoryId,
          title: itemTitle.trim(),
          price: safeNum(itemPrice),
          sku: itemSku.trim() || null,
          description: itemDescription.trim() || null,
          is_available: status !== "out_of_stock" && !!itemAvailable,
          image_url: imageUrl,
          sort_order: sortOrder,
          track_inventory: true,
          stock_qty: initialStock,
          low_stock_threshold: lowThreshold,
          stock_status: status,
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
      setItemInitialStock("0");
      setItemLowThreshold("5");

      if (previewStoreId) loadCatalogueForStore(previewStoreId);
    } catch (e) {
      setErr(e?.message || "Failed to add item.");
    } finally {
      setSavingItem(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {err ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}
        {ok ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div> : null}

        <Card title="Upload Catalogue Images" subtitle="Image-only catalogue is available to all stores.">
          {loadingStores ? (
            <SectionSkeleton />
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
                  <input id="catalogue-image-input" type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
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
                        <button type="button" onClick={() => removeFile(idx)} className="mt-2 h-8 w-full rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50">
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
          title={
            <div className="flex items-center gap-2">
              <span>PickUp / Service Catalogue</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <Crown className="h-3 w-3" />
                Premium
              </span>
            </div>
          }
          subtitle={
            previewStorePremiumUnlocked
              ? "Premium unlocked for this store."
              : "This section is hidden for this store until premium is active."
          }
          right={
            !previewStorePremiumUnlocked ? (
              <button
                type="button"
                onClick={openPremiumModal}
                className="h-9 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                Subscribe Premium
              </button>
            ) : null
          }
        >
          {loadingStores ? (
            <SectionSkeleton />
          ) : !previewStorePremiumUnlocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Premium section locked for selected store
              </div>
              <div className="mt-1">
                This store does not have active premium. Subscribe premium to unlock PickUp / Service catalogue and scheduling.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Scheduling Configuration (Store-level)
                  </div>
                  <button
                    type="button"
                    onClick={saveSchedulingConfig}
                    disabled={savingSchedule || !previewStoreId}
                    className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Scheduling
                  </button>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mt-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={slotEnabled} onChange={(e) => setSlotEnabled(e.target.checked)} />
                    Enable slots
                  </label>

                  <div>
                    <p className="text-xs text-gray-600 mb-1">Slot mode</p>
                    <select value={slotMode} onChange={(e) => setSlotMode(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none">
                      <option value="OPTIONAL">Optional for customer</option>
                      <option value="REQUIRED">Required for customer</option>
                    </select>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 mb-1">Store for config</p>
                    <select value={previewStoreId} onChange={(e) => setPreviewStoreId(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none">
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-5 gap-3 mt-3">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Duration (min)</p>
                    <input type="number" min="5" value={slotDuration} onChange={(e) => setSlotDuration(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Buffer (min)</p>
                    <input type="number" min="0" value={slotBuffer} onChange={(e) => setSlotBuffer(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Advance days</p>
                    <input type="number" min="1" value={slotAdvanceDays} onChange={(e) => setSlotAdvanceDays(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Max per slot</p>
                    <input type="number" min="1" value={slotMaxPerWindow} onChange={(e) => setSlotMaxPerWindow(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Start</p>
                      <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm outline-none" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">End</p>
                      <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm outline-none" />
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-xs text-gray-600 mb-2">Available days</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((d) => {
                      const active = slotDays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => toggleSlotDay(d.key)}
                          className={`rounded-full px-3 py-1.5 text-xs border ${
                            active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

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
                      <input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300" placeholder="e.g. Haircut Service / Shirt" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-2">Price (MUR)</div>
                      <input type="number" min="0" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300" placeholder="e.g. 250" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-2">SKU</div>
                      <input value={itemSku} onChange={(e) => setItemSku(e.target.value)} className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300" placeholder="e.g. BRG-001" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-2">Initial Stock</div>
                      <input type="number" min="0" value={itemInitialStock} onChange={(e) => setItemInitialStock(e.target.value)} className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300" placeholder="e.g. 10" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-2">Low Stock Threshold</div>
                      <input type="number" min="0" value={itemLowThreshold} onChange={(e) => setItemLowThreshold(e.target.value)} className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300" placeholder="e.g. 5" />
                    </div>

                    <div className="md:col-span-2 mt-1">
                      <div className="mt-2">
                        <label className="block text-xs font-semibold text-gray-600 mb-2">Description</label>
                        <textarea className="min-h-[80px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-300" placeholder="Add details..." value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={itemAvailable} onChange={(e) => setItemAvailable(e.target.checked)} />
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
                  <label htmlFor="item-image-input" className="h-11 px-4 rounded-full border border-gray-200 bg-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-gray-50">
                    <ImagePlus className="h-4 w-4" />
                    Select Item Image
                  </label>
                  <input id="item-image-input" type="file" accept="image/*" onChange={onPickItemImage} className="hidden" />

                  {itemImage ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                      <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                        <img src={URL.createObjectURL(itemImage)} alt="item preview" className="h-full w-full object-cover" />
                      </div>
                      <button type="button" onClick={() => setItemImage(null)} className="mt-3 h-9 w-full rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50">
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
            </div>
          )}
        </Card>
      </div>

      <PremiumModal
        open={premiumModalOpen}
        onClose={() => !premiumSaving && setPremiumModalOpen(false)}
        onConfirm={handleSubscribePremium}
        loading={premiumSaving}
        cardName={cardName}
        setCardName={setCardName}
        cardNumber={cardNumber}
        setCardNumber={setCardNumber}
        cardExpiry={cardExpiry}
        setCardExpiry={setCardExpiry}
        cardCvv={cardCvv}
        setCardCvv={setCardCvv}
        error={premiumError}
        targetCount={targetPremiumStoreIds.length}
      />
    </div>
  );
}
