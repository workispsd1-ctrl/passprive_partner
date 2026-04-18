"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SkeletonBlock } from "@/components/ui/PageSkeletons";
import { fetchMyStores } from "@/lib/store-partner/stores";
import {
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Eye,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Crown,
  AlertTriangle,
} from "lucide-react";

const BUCKET_NAME = "stores";
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

function asText(v) {
  const text = String(v || "").trim();
  return text || null;
}

function money(v) {
  const num = Number(v || 0);
  return `MUR ${num.toLocaleString()}`;
}

function readPreferredStoreId() {
  if (typeof window === "undefined") return "";
  for (const key of STORE_ID_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) return String(value);
  }
  return "";
}

function savePreferredStoreId(id) {
  if (typeof window === "undefined" || !id) return;
  STORE_ID_STORAGE_KEYS.forEach((key) => window.localStorage.setItem(key, String(id)));
  window.dispatchEvent(new Event("store-selection-changed"));
}

function normalizeStoreType(value) {
  return String(value || "PRODUCT").toUpperCase() === "SERVICE" ? "SERVICE" : "PRODUCT";
}

function sectionLabel(storeType) {
  return normalizeStoreType(storeType) === "SERVICE" ? "Services" : "Catalogue";
}

function isPremiumActive(store) {
  const pickupMode = String(store?.pickup_mode || "").toUpperCase();
  const modeImpliesPremium = ["PREMIUM", "PICKUP_PREMIUM", "FULL"].includes(pickupMode);

  if (!store?.pickup_premium_enabled && !modeImpliesPremium) return false;
  if (!store?.pickup_premium_expires_at) return true;

  const ts = new Date(store.pickup_premium_expires_at).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function stockStatusFromQty(qty, lowThreshold = 5) {
  const n = Number(qty || 0);
  const low = Number(lowThreshold || 5);
  if (n <= 0) return "out_of_stock";
  if (n <= low) return "low_stock";
  return "in_stock";
}

function getInitialCategoryForm() {
  return {
    title: "",
    starting_from: "",
    enabled: true,
    sort_order: "",
  };
}

function getInitialItemForm(storeType = "PRODUCT") {
  if (normalizeStoreType(storeType) === "SERVICE") {
    return {
      category_title: "",
      title: "",
      description: "",
      price: "",
      sku: "",
      image_url: "",
      is_available: true,
      is_billable: false,
      duration_minutes: "30",
      supports_slot_booking: false,
      track_inventory: false,
      stock_qty: "0",
      low_stock_threshold: "5",
      allow_backorder: false,
      is_image_catalogue: false,
    };
  }

  return {
    category_title: "",
    title: "",
    description: "",
    price: "",
    sku: "",
    image_url: "",
    is_available: true,
    is_billable: false,
    duration_minutes: "",
    supports_slot_booking: false,
    track_inventory: false,
    stock_qty: "0",
    low_stock_threshold: "5",
    allow_backorder: false,
    is_image_catalogue: true,
  };
}

function getInitialScheduleForm() {
  return {
    supports_time_slots: false,
    slot_duration_minutes: "30",
    slot_buffer_minutes: "0",
    slot_advance_days: "30",
    slot_max_per_window: "1",
  };
}

function findCategoryByTitle(categories, title) {
  const clean = String(title || "").trim().toLowerCase();
  if (!clean) return null;
  return categories.find((category) => String(category.title || "").trim().toLowerCase() === clean) || null;
}

function Card({ title, subtitle, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}
        </div>
        {right || null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function CatalogueHeroSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
          <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
          <SkeletonBlock className="mt-4 h-11 w-full rounded-2xl border-gray-200 bg-white" />
        </div>
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-4">
            <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="mt-4 h-7 w-28 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="mt-3 h-4 w-36 border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <SkeletonBlock className="h-4 w-44 border-gray-200 bg-gray-100" />
        <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
      </div>
    </div>
  );
}

function CatalogueEditorSkeleton({ service = false }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: service ? 5 : 4 }).map((_, idx) => (
        <div key={idx} className="space-y-3">
          <SkeletonBlock className="h-4 w-28 border-gray-200 bg-gray-100" />
          <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
        </div>
      ))}
      <SkeletonBlock className="h-28 w-full rounded-2xl border-gray-200 bg-gray-100" />
      <div className={`grid gap-4 ${service ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {Array.from({ length: service ? 2 : 3 }).map((_, idx) => (
          <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4">
            <SkeletonBlock className="h-5 w-32 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="h-11 w-44 rounded-full border-gray-200 bg-gray-100" />
    </div>
  );
}

function CatalogueStructureSkeleton({ service = false }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <SkeletonBlock className="h-6 w-40 border-gray-200 bg-gray-100" />
              <div className="flex flex-wrap gap-2">
                <SkeletonBlock className="h-7 w-24 rounded-full border-gray-200 bg-gray-100" />
                <SkeletonBlock className="h-7 w-32 rounded-full border-gray-200 bg-gray-100" />
              </div>
              <SkeletonBlock className="h-4 w-52 border-gray-200 bg-gray-100" />
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
              <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((__, itemIdx) => (
              <div
                key={itemIdx}
                className={`grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 ${
                  service ? "md:grid-cols-[84px_1fr]" : "md:grid-cols-[96px_1fr_auto]"
                }`}
              >
                <SkeletonBlock className={`${service ? "h-20" : "h-24"} w-full rounded-2xl border-gray-200 bg-white`} />
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <SkeletonBlock className="h-5 w-36 border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="h-6 w-20 rounded-full border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="h-6 w-24 rounded-full border-gray-200 bg-gray-100" />
                  </div>
                  <SkeletonBlock className="h-4 w-full border-gray-200 bg-gray-100" />
                  <SkeletonBlock className="h-4 w-3/4 border-gray-200 bg-gray-100" />
                </div>
                {service ? null : (
                  <div className="flex gap-2">
                    <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceScheduleSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="space-y-3">
            <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
        <SkeletonBlock className="h-5 w-28 border-gray-200 bg-gray-100" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4">
              <SkeletonBlock className="h-5 w-32 border-gray-200 bg-gray-100" />
              <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <SkeletonBlock className="h-5 w-40 border-gray-200 bg-gray-100" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-40 border-gray-200 bg-gray-100" />
                  <div className="flex gap-2">
                    <SkeletonBlock className="h-6 w-24 rounded-full border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="h-6 w-24 rounded-full border-gray-200 bg-gray-100" />
                  </div>
                </div>
                <SkeletonBlock className="h-5 w-5 rounded border-gray-200 bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <SkeletonBlock className="h-11 w-52 rounded-full border-gray-200 bg-gray-100" />
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</div>
        {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[110px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={[
        "h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        disabled ? "border-gray-200 bg-gray-50 opacity-70" : "border-gray-200 bg-white",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300"
      />
      <span className="block">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-gray-500">{description}</span> : null}
      </span>
    </label>
  );
}

function Badge({ children, tone = "gray" }) {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-gray-200 bg-gray-50 text-gray-700";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}

export default function PartnerCataloguePage() {
  const router = useRouter();
  const categoryFormRef = useRef(null);
  const itemFormRef = useRef(null);

  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [categoryForm, setCategoryForm] = useState(getInitialCategoryForm());
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState("");

  const [itemForm, setItemForm] = useState(getInitialItemForm("PRODUCT"));
  const [editingItemId, setEditingItemId] = useState("");
  const [itemImageFiles, setItemImageFiles] = useState([]);
  const [itemImagePreviewUrls, setItemImagePreviewUrls] = useState([]);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState("");

  const [scheduleForm, setScheduleForm] = useState(getInitialScheduleForm());
  const [scheduleScope, setScheduleScope] = useState("CURRENT");
  const [scheduleTargetIds, setScheduleTargetIds] = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const storeMap = useMemo(() => {
    const map = new Map();
    stores.forEach((store) => map.set(String(store.id), store));
    return map;
  }, [stores]);

  const selectedStore = useMemo(
    () => storeMap.get(String(selectedStoreId)) || null,
    [storeMap, selectedStoreId]
  );

  const selectedStoreType = normalizeStoreType(selectedStore?.store_type);
  const selectedSectionLabel = sectionLabel(selectedStoreType);
  const isServiceStore = selectedStoreType === "SERVICE";
  const isProductStore = !isServiceStore;
  const premiumUnlocked = isPremiumActive(selectedStore);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const bySort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (bySort !== 0) return bySort;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [categories]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const bySort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (bySort !== 0) return bySort;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [items]);

  const itemsByCategory = useMemo(() => {
    const map = new Map();
    sortedCategories.forEach((category) => map.set(String(category.id), []));
    sortedItems.forEach((item) => {
      const key = String(item.category_id || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [sortedCategories, sortedItems]);

  const previewCategories = useMemo(() => {
    return sortedCategories
      .filter((category) => category.enabled !== false)
      .map((category) => ({
        ...category,
        items: (itemsByCategory.get(String(category.id)) || []).filter((item) => item.is_available !== false),
      }))
      .filter((category) => category.items.length > 0);
  }, [sortedCategories, itemsByCategory]);

  const linkedServiceBranches = useMemo(() => {
    return stores.filter((store) => normalizeStoreType(store.store_type) === "SERVICE");
  }, [stores]);

  const effectiveScheduleTargetIds = useMemo(() => {
    if (scheduleScope === "ALL") return linkedServiceBranches.map((store) => String(store.id));
    if (scheduleScope === "CUSTOM") return scheduleTargetIds;
    return selectedStoreId ? [String(selectedStoreId)] : [];
  }, [scheduleScope, linkedServiceBranches, scheduleTargetIds, selectedStoreId]);

  const currentItemIsImageOnly =
    isProductStore && (!premiumUnlocked || Boolean(itemForm.is_image_catalogue));

  const loadStores = async () => {
    const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
    if (sessErr) throw sessErr;

    const userId = sess?.session?.user?.id;
    if (!userId) {
      router.replace("/sign-in");
      return [];
    }

    const stores = await fetchMyStores();
    return [...stores].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  };

  const loadCatalogueData = async (storeId) => {
    if (!storeId) {
      setCategories([]);
      setItems([]);
      return;
    }

    setLoadingData(true);
    try {
      const [categoryRes, itemRes] = await Promise.all([
        supabaseBrowser
          .from("store_catalogue_categories")
          .select("id,store_id,title,starting_from,enabled,sort_order,created_at,updated_at")
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabaseBrowser
          .from("store_catalogue_items")
          .select(
            "id,store_id,category_id,title,description,price,sku,image_url,is_available,item_type,is_billable,duration_minutes,supports_slot_booking,track_inventory,stock_qty,low_stock_threshold,stock_status,allow_backorder,is_image_catalogue,sort_order,created_at,updated_at"
          )
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);

      if (categoryRes.error) throw categoryRes.error;
      if (itemRes.error) throw itemRes.error;

      const loadedCategories = categoryRes.data || [];
      const loadedItems = (itemRes.data || []).map((item) => ({
        ...item,
        item_type: normalizeStoreType(item.item_type),
        stock_qty: item.stock_qty ?? null,
        low_stock_threshold: item.low_stock_threshold ?? 5,
      }));

      setCategories(loadedCategories);
      setItems(loadedItems);

      setCategoryForm(getInitialCategoryForm());
      setEditingCategoryId("");
      setEditingItemId("");
      setItemImageFiles([]);
      setItemImagePreviewUrls([]);

      setItemForm((prev) => {
        const next = getInitialItemForm(selectedStoreType);
        const fallbackCategoryTitle = loadedCategories[0]?.title ? String(loadedCategories[0].title) : "";
        return {
          ...next,
          category_title:
            prev.category_title &&
            loadedCategories.some(
              (category) =>
                String(category.title || "").trim().toLowerCase() ===
                String(prev.category_title || "").trim().toLowerCase()
            )
              ? prev.category_title
              : fallbackCategoryTitle,
        };
      });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingStores(true);
        const loadedStores = await loadStores();
        if (cancelled) return;

        setStores(loadedStores);

        const preferredId = readPreferredStoreId();
        const nextStoreId =
          loadedStores.find((store) => String(store.id) === String(preferredId))?.id || loadedStores[0]?.id || "";

        if (nextStoreId) {
          setSelectedStoreId(String(nextStoreId));
          savePreferredStoreId(String(nextStoreId));
        }
      } catch (error) {
        if (!cancelled) toast.error(error?.message || "Failed to load partner stores.");
      } finally {
        if (!cancelled) setLoadingStores(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    savePreferredStoreId(selectedStoreId);

    (async () => {
      try {
        await loadCatalogueData(selectedStoreId);
      } catch (error) {
        toast.error(error?.message || `Failed to load ${selectedSectionLabel.toLowerCase()}.`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  useEffect(() => {
    setScheduleForm({
      supports_time_slots: Boolean(selectedStore?.supports_time_slots),
      slot_duration_minutes: String(selectedStore?.slot_duration_minutes ?? 30),
      slot_buffer_minutes: String(selectedStore?.slot_buffer_minutes ?? 0),
      slot_advance_days: String(selectedStore?.slot_advance_days ?? 30),
      slot_max_per_window: String(selectedStore?.slot_max_per_window ?? 1),
    });
    setScheduleScope("CURRENT");
    setScheduleTargetIds(selectedStoreId ? [String(selectedStoreId)] : []);
  }, [selectedStoreId, selectedStore]);

  useEffect(() => {
    setItemForm((prev) => {
      const fallbackCategoryTitle = sortedCategories[0]?.title ? String(sortedCategories[0].title) : "";
      const nextCategoryTitle =
        prev.category_title &&
        sortedCategories.some(
          (category) =>
            String(category.title || "").trim().toLowerCase() ===
            String(prev.category_title || "").trim().toLowerCase()
        )
          ? prev.category_title
          : fallbackCategoryTitle;

      return {
        ...prev,
        category_title: nextCategoryTitle,
      };
    });
  }, [sortedCategories]);

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

  const refreshCurrentStore = async () => {
    if (!selectedStoreId) return;
    try {
      setLoadingData(true);
      const freshStores = await loadStores();
      setStores(freshStores);
      await loadCatalogueData(selectedStoreId);
    } catch (error) {
      toast.error(error?.message || "Failed to refresh catalogue data.");
      setLoadingData(false);
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm(getInitialCategoryForm());
    setEditingCategoryId("");
  };

  const resetItemForm = () => {
    setEditingItemId("");
    setItemImageFiles([]);
    setItemImagePreviewUrls([]);
    setItemForm({
      ...getInitialItemForm(selectedStoreType),
      category_title: sortedCategories[0]?.title ? String(sortedCategories[0].title) : "",
    });
  };

  const handleSaveCategory = async () => {
    if (!selectedStoreId || !categoryForm.title.trim()) {
      toast.error("Enter a category title first.");
      return;
    }

    try {
      setSavingCategory(true);

      const sortOrder =
        safeNum(categoryForm.sort_order) ??
        (editingCategoryId
          ? Number(categories.find((category) => String(category.id) === String(editingCategoryId))?.sort_order || 0)
          : categories.length);

      const payload = {
        store_id: selectedStoreId,
        title: categoryForm.title.trim(),
        starting_from: safeNum(categoryForm.starting_from),
        enabled: Boolean(categoryForm.enabled),
        sort_order: sortOrder,
      };

      if (editingCategoryId) {
        const { error } = await supabaseBrowser
          .from("store_catalogue_categories")
          .update(payload)
          .eq("id", editingCategoryId);
        if (error) throw error;
        toast.success("Category updated.");
      } else {
        const { error } = await supabaseBrowser.from("store_catalogue_categories").insert(payload);
        if (error) throw error;
        toast.success("Category created.");
      }

      await loadCatalogueData(selectedStoreId);
      resetCategoryForm();
    } catch (error) {
      toast.error(error?.message || "Failed to save category.");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategoryId(String(category.id));
    setCategoryForm({
      title: category.title || "",
      starting_from: category.starting_from ?? "",
      enabled: category.enabled !== false,
      sort_order: category.sort_order ?? "",
    });
    categoryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteCategory = async (category) => {
    const linkedItems = items.filter((item) => String(item.category_id) === String(category.id));
    if (linkedItems.length) {
      toast.error("Delete or move the items in this category before removing it.");
      return;
    }

    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete "${category.title}"?`);
      if (!ok) return;
    }

    try {
      setDeletingCategoryId(String(category.id));
      const { error } = await supabaseBrowser
        .from("store_catalogue_categories")
        .delete()
        .eq("id", category.id);
      if (error) throw error;
      toast.success("Category deleted.");
      await loadCatalogueData(selectedStoreId);
      if (String(editingCategoryId) === String(category.id)) resetCategoryForm();
    } catch (error) {
      toast.error(error?.message || "Failed to delete category.");
    } finally {
      setDeletingCategoryId("");
    }
  };

  const validateItemForm = () => {
    if (!itemForm.category_title.trim()) return "Pick a category title first.";
    if (!findCategoryByTitle(sortedCategories, itemForm.category_title)) {
      return "Choose an existing category title from the categories you created above.";
    }

    const hasImage = Boolean(itemImageFiles.length || itemForm.image_url);
    const price = safeNum(itemForm.price);
    const duration = safeNum(itemForm.duration_minutes);

    if (isProductStore && !hasImage) return "Product catalogue entries need an image.";
    if (isServiceStore && !itemForm.title.trim()) return "Service title is required.";

    if (isProductStore && premiumUnlocked && !currentItemIsImageOnly && !itemForm.title.trim()) {
      return "Full product items need a title.";
    }

    if (isProductStore && premiumUnlocked && !currentItemIsImageOnly && itemForm.is_billable && price === null) {
      return "Billable products need a price.";
    }

    if (isServiceStore && premiumUnlocked && itemForm.supports_slot_booking && duration === null) {
      return "Slot-bookable services need a duration.";
    }

    if (isServiceStore && premiumUnlocked && itemForm.is_billable && price === null) {
      return "Billable services need a price.";
    }

    return "";
  };

  const handleSaveItem = async () => {
    const validationError = validateItemForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSavingItem(true);

      const matchedCategory = findCategoryByTitle(sortedCategories, itemForm.category_title);
      if (!matchedCategory?.id) {
        throw new Error("Choose a valid category title before saving.");
      }

      const price = safeNum(itemForm.price);
      const duration = safeNum(itemForm.duration_minutes);
      const stockQty = Math.max(0, Number(itemForm.stock_qty || 0));
      const lowThreshold = Math.max(0, Number(itemForm.low_stock_threshold || 5));

      let payload;
      const uploadedImageUrls = itemImageFiles.length
        ? await Promise.all(itemImageFiles.map((file) => uploadImage(selectedStoreId, file)))
        : itemForm.image_url
        ? [itemForm.image_url]
        : [];

      if (isProductStore) {
        const imageOnly = !premiumUnlocked || Boolean(itemForm.is_image_catalogue);
        const trackInventory = premiumUnlocked && !imageOnly && Boolean(itemForm.track_inventory);

        payload = {
          store_id: selectedStoreId,
          category_id: matchedCategory.id,
          item_type: "PRODUCT",
          image_url: uploadedImageUrls[0] || null,
          title: imageOnly ? asText(itemForm.title) : itemForm.title.trim(),
          price,
          description: asText(itemForm.description),
          sku: premiumUnlocked ? asText(itemForm.sku) : null,
          is_available: Boolean(itemForm.is_available),
          is_billable: premiumUnlocked && !imageOnly ? Boolean(itemForm.is_billable) : false,
          duration_minutes: null,
          supports_slot_booking: false,
          track_inventory: trackInventory,
          stock_qty: trackInventory ? stockQty : null,
          low_stock_threshold: trackInventory ? lowThreshold : 5,
          stock_status: trackInventory ? stockStatusFromQty(stockQty, lowThreshold) : null,
          allow_backorder: trackInventory ? Boolean(itemForm.allow_backorder) : false,
          is_image_catalogue: imageOnly,
        };
      } else {
        payload = {
          store_id: selectedStoreId,
          category_id: matchedCategory.id,
          item_type: "SERVICE",
          image_url: uploadedImageUrls[0] || null,
          title: itemForm.title.trim(),
          price,
          description: asText(itemForm.description),
          sku: null,
          is_available: Boolean(itemForm.is_available),
          is_billable: premiumUnlocked ? Boolean(itemForm.is_billable) : false,
          duration_minutes: duration,
          supports_slot_booking: premiumUnlocked ? Boolean(itemForm.supports_slot_booking) : false,
          track_inventory: false,
          stock_qty: null,
          low_stock_threshold: 5,
          stock_status: null,
          allow_backorder: false,
          is_image_catalogue: false,
        };
      }

      if (editingItemId) {
        const { error } = await supabaseBrowser
          .from("store_catalogue_items")
          .update(payload)
          .eq("id", editingItemId);
        if (error) throw error;
        toast.success(`${isServiceStore ? "Service" : "Item"} updated.`);
      } else {
        const nextSort =
          sortedItems.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), -1) + 1;
        const rows =
          isProductStore && (!premiumUnlocked || Boolean(itemForm.is_image_catalogue)) && uploadedImageUrls.length > 1
            ? uploadedImageUrls.map((imageUrl, index) => ({
                ...payload,
                image_url: imageUrl,
                sort_order: nextSort + index,
              }))
            : [
                {
                  ...payload,
                  sort_order: nextSort,
                },
              ];

        const { error } = await supabaseBrowser.from("store_catalogue_items").insert(rows);
        if (error) throw error;
        toast.success(
          rows.length > 1
            ? `${rows.length} catalogue items added.`
            : `${isServiceStore ? "Service" : "Item"} added.`
        );
      }

      await loadCatalogueData(selectedStoreId);
      resetItemForm();
    } catch (error) {
      toast.error(error?.message || "Failed to save item.");
    } finally {
      setSavingItem(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(String(item.id));
    setItemImageFiles([]);
    setItemImagePreviewUrls(item.image_url ? [item.image_url] : []);
    const linkedCategory = categories.find((category) => String(category.id) === String(item.category_id));
    setItemForm({
      category_title: linkedCategory?.title || "",
      title: item.title || "",
      description: item.description || "",
      price: item.price ?? "",
      sku: item.sku || "",
      image_url: item.image_url || "",
      is_available: item.is_available !== false,
      is_billable: Boolean(item.is_billable),
      duration_minutes: item.duration_minutes ?? "",
      supports_slot_booking: Boolean(item.supports_slot_booking),
      track_inventory: Boolean(item.track_inventory),
      stock_qty: item.stock_qty ?? "0",
      low_stock_threshold: item.low_stock_threshold ?? "5",
      allow_backorder: Boolean(item.allow_backorder),
      is_image_catalogue: Boolean(item.is_image_catalogue),
    });
    itemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteItem = async (item) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete "${item.title || "this item"}"?`);
      if (!ok) return;
    }

    try {
      setDeletingItemId(String(item.id));
      const { error } = await supabaseBrowser.from("store_catalogue_items").delete().eq("id", item.id);
      if (error) throw error;
      toast.success(`${isServiceStore ? "Service" : "Item"} deleted.`);
      await loadCatalogueData(selectedStoreId);
      if (String(editingItemId) === String(item.id)) resetItemForm();
    } catch (error) {
      toast.error(error?.message || "Failed to delete item.");
    } finally {
      setDeletingItemId("");
    }
  };

  const toggleScheduleTarget = (storeId, checked) => {
    setScheduleTargetIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(storeId));
      else next.delete(String(storeId));
      return Array.from(next);
    });
  };

  const handleSaveSchedule = async () => {
    if (!selectedStoreId) return;
    if (!effectiveScheduleTargetIds.length) {
      toast.error("Select at least one branch to apply slot settings.");
      return;
    }

    if (typeof window !== "undefined" && effectiveScheduleTargetIds.length > 1) {
      const targetNames = effectiveScheduleTargetIds
        .map((id) => storeMap.get(String(id))?.name || "Branch")
        .join(", ");
      const ok = window.confirm(`Apply these slot settings to ${effectiveScheduleTargetIds.length} branches?\n\n${targetNames}`);
      if (!ok) return;
    }

    try {
      setSavingSchedule(true);

      const payload = {
        supports_time_slots: Boolean(scheduleForm.supports_time_slots),
        slot_duration_minutes: Math.max(5, Number(scheduleForm.slot_duration_minutes || 30)),
        slot_buffer_minutes: Math.max(0, Number(scheduleForm.slot_buffer_minutes || 0)),
        slot_advance_days: Math.max(1, Number(scheduleForm.slot_advance_days || 30)),
        slot_max_per_window: Math.max(1, Number(scheduleForm.slot_max_per_window || 1)),
      };

      for (const storeId of effectiveScheduleTargetIds) {
        const { error } = await supabaseBrowser.from("stores").update(payload).eq("id", storeId);
        if (error) throw error;
      }

      setStores((prev) =>
        prev.map((store) =>
          effectiveScheduleTargetIds.includes(String(store.id))
            ? { ...store, ...payload }
            : store
        )
      );

      toast.success(
        effectiveScheduleTargetIds.length > 1
          ? "Slot settings updated across linked branches."
          : "Slot settings updated for this branch."
      );
    } catch (error) {
      toast.error(error?.message || "Failed to update slot settings.");
    } finally {
      setSavingSchedule(false);
    }
  };

  const onPickItemImage = (event) => {
    const incoming = Array.from(event.target.files || []).filter(isImage);
    if (!incoming.length) {
      toast.error("Select an image file.");
      return;
    }

    const allowMultiple = isProductStore && currentItemIsImageOnly && !editingItemId;
    const nextFiles = allowMultiple ? incoming : [incoming[0]];

    setItemImageFiles(nextFiles);
    setItemImagePreviewUrls(nextFiles.map((file) => URL.createObjectURL(file)));
    setItemForm((prev) => ({ ...prev, image_url: prev.image_url || "" }));
    event.target.value = "";
  };

  const heroDescription = isServiceStore
    ? premiumUnlocked
      ? "Create a service menu that is ready for slot booking and payment flows."
      : "Build a visible service menu now. Slot booking and billable actions stay gated until premium is active."
    : premiumUnlocked
    ? "Manage a full pickup-ready product catalogue with pricing, availability, and inventory."
    : "Build an image-first catalogue. Non-premium product stores stay in visual catalogue mode only.";

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-4">
        <Card
          title={
            <div className="flex items-center gap-2">
              {isServiceStore ? <BriefcaseBusiness className="h-5 w-5 text-sky-600" /> : <Boxes className="h-5 w-5 text-[#771FA8]" />}
              <span>{selectedSectionLabel}</span>
            </div>
          }
          subtitle={heroDescription}
          right={
            <button
              type="button"
              onClick={refreshCurrentStore}
              disabled={loadingStores || loadingData}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          }
        >
          {loadingStores ? (
            <CatalogueHeroSkeleton />
          ) : !stores.length ? (
            <EmptyState
              title="No linked branches found"
              body="This partner account is not linked to any store branches yet."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Store className="h-4 w-4" />
                    Branch
                  </div>
                  <Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} {store.city ? `• ${store.city}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Store Type</div>
                  <div className="mt-3 text-lg font-semibold text-gray-900">{selectedStoreType}</div>
                  <div className="mt-1 text-sm text-gray-500">Portal label: {selectedSectionLabel}</div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Premium State</div>
                  <div className="mt-3">
                    <Badge tone={premiumUnlocked ? "green" : "amber"}>
                      {premiumUnlocked ? "Premium active" : "Premium gated"}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    {selectedStore?.pickup_mode ? `Pickup mode: ${selectedStore.pickup_mode}` : "Using standard pickup mode."}
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Content</div>
                  <div className="mt-3 text-lg font-semibold text-gray-900">
                    {categories.length} categories
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{items.length} items configured</div>
                </div>
              </div>

              {!premiumUnlocked ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Crown className="h-4 w-4" />
                    Premium-only actions are gated
                  </div>
                  <div className="mt-1">
                    {isServiceStore
                      ? "This branch can publish a service menu now, but slot booking and billable service actions stay disabled until premium is active."
                      : "This branch stays in image catalogue mode. Full pickup-ready products, billable items, and inventory controls unlock only with premium."}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        {loadingStores || !selectedStore ? null : (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div ref={categoryFormRef}>
            <Card
              title="Category Manager"
              subtitle={`Create and order ${selectedSectionLabel.toLowerCase()} categories.`}
              right={
                editingCategoryId ? (
                  <button
                    type="button"
                    onClick={resetCategoryForm}
                    className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel Edit
                  </button>
                ) : null
              }
            >
              {loadingData ? (
                <CatalogueEditorSkeleton service={isServiceStore} />
              ) : (
                <div className="space-y-4">
                  <Field label="Category Title">
                    <Input
                      value={categoryForm.title}
                      onChange={(e) => setCategoryForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder={isServiceStore ? "Haircuts" : "New Arrivals"}
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Starting From">
                      <Input
                        value={categoryForm.starting_from}
                        onChange={(e) => setCategoryForm((prev) => ({ ...prev, starting_from: e.target.value }))}
                        placeholder="Optional price hint"
                        inputMode="decimal"
                      />
                    </Field>

                    <Field label="Sort Order">
                      <Input
                        value={categoryForm.sort_order}
                        onChange={(e) => setCategoryForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                        placeholder="0"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>

                  <Toggle
                    checked={categoryForm.enabled}
                    onChange={(checked) => setCategoryForm((prev) => ({ ...prev, enabled: checked }))}
                    label="Category enabled"
                    description="Disabled categories stay hidden from the customer-facing preview."
                  />

                  <button
                    type="button"
                    onClick={handleSaveCategory}
                    disabled={savingCategory}
                    className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
                    style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
                  >
                    {savingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCategoryId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingCategoryId ? "Save Category" : "Create Category"}
                  </button>
                </div>
              )}
            </Card>
            </div>

            <div ref={itemFormRef}>
            <Card
              title={isServiceStore ? "Service Form" : "Item Form"}
              subtitle={
                isServiceStore
                  ? "Keep service creation guided, with slot-booking and billing gated by premium."
                  : premiumUnlocked
                  ? "Choose between image-only catalogue entries and full pickup-ready product items."
                  : "Non-premium product branches stay in image-first catalogue mode."
              }
              right={
                editingItemId ? (
                  <button
                    type="button"
                    onClick={resetItemForm}
                    className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel Edit
                  </button>
                ) : null
              }
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Category Title" hint="Select one of the categories created above">
                    <div>
                      <Select
                        value={itemForm.category_title}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, category_title: e.target.value }))}
                        disabled={!sortedCategories.length}
                      >
                        <option value="">{sortedCategories.length ? "Choose category title" : "Create category first"}</option>
                        {sortedCategories.map((category) => (
                          <option key={category.id} value={category.title}>
                            {category.title}
                          </option>
                        ))}
                      </Select>
                      <div className="mt-2 text-xs text-gray-500">
                        Each item belongs to one category in the current schema.
                      </div>
                    </div>
                  </Field>

                  {isProductStore ? (
                    <Field label="Product Mode">
                      <Select
                        value={itemForm.is_image_catalogue ? "IMAGE_ONLY" : "FULL_PRODUCT"}
                        onChange={(e) =>
                          setItemForm((prev) => ({
                            ...prev,
                            is_image_catalogue: e.target.value === "IMAGE_ONLY",
                            track_inventory: e.target.value === "IMAGE_ONLY" ? false : prev.track_inventory,
                            is_billable: e.target.value === "IMAGE_ONLY" ? false : prev.is_billable,
                          }))
                        }
                        disabled={!premiumUnlocked}
                      >
                        <option value="IMAGE_ONLY">Image-only catalogue item</option>
                        <option value="FULL_PRODUCT">Full product entry</option>
                      </Select>
                      {!premiumUnlocked ? (
                        <div className="mt-2 text-xs text-amber-700">
                          Non-premium product branches are locked to image-only catalogue items.
                        </div>
                      ) : null}
                    </Field>
                  ) : null}
                </div>

                <Field label={isServiceStore ? "Image" : "Image"} hint={isServiceStore ? "Optional" : "Required"}>
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="catalogue-item-image"
                        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ImagePlus className="h-4 w-4" />
                        Upload image
                      </label>
                      <input
                        id="catalogue-item-image"
                        type="file"
                        accept="image/*"
                        multiple={isProductStore && currentItemIsImageOnly && !editingItemId}
                        onChange={onPickItemImage}
                        className="hidden"
                      />
                      <span className="text-sm text-gray-500">
                        {itemImageFiles.length
                          ? `${itemImageFiles.length} image(s) selected`
                          : itemForm.image_url
                          ? "Using current image"
                          : "No image selected yet"}
                      </span>
                    </div>

                    {isProductStore && currentItemIsImageOnly && !editingItemId ? (
                      <div className="mt-2 text-xs text-gray-500">
                        You can select multiple images here. Each image will be saved as its own catalogue item.
                      </div>
                    ) : null}

                    {itemImagePreviewUrls.length || itemForm.image_url ? (
                      <div
                        className={[
                          "mt-4 gap-3",
                          itemImagePreviewUrls.length > 1 ? "grid grid-cols-2 md:grid-cols-3" : "grid grid-cols-1",
                        ].join(" ")}
                      >
                        {(itemImagePreviewUrls.length ? itemImagePreviewUrls : itemForm.image_url ? [itemForm.image_url] : []).map((src, index) => (
                          <div key={`${src}_${index}`} className="h-36 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            <img src={src} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={isServiceStore ? "Title" : currentItemIsImageOnly ? "Title (optional)" : "Title"}>
                    <Input
                      value={itemForm.title}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder={isServiceStore ? "Classic Beard Trim" : "Canvas Tote Bag"}
                    />
                  </Field>

                  <Field label={isServiceStore ? (premiumUnlocked && itemForm.is_billable ? "Price" : "Price (optional)") : currentItemIsImageOnly ? "Price (optional)" : itemForm.is_billable ? "Price" : "Price (optional)"}>
                    <Input
                      value={itemForm.price}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={isServiceStore ? "Service details, inclusions, and preparation notes." : "Short description for customers."}
                  />
                </Field>

                {isProductStore && premiumUnlocked && !currentItemIsImageOnly ? (
                  <Field label="SKU">
                    <Input
                      value={itemForm.sku}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, sku: e.target.value }))}
                      placeholder="Optional SKU"
                    />
                  </Field>
                ) : null}

                {isServiceStore ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Duration (minutes)" hint={itemForm.supports_slot_booking ? "Required for slot booking" : "Optional"}>
                      <Input
                        value={itemForm.duration_minutes}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                        placeholder="30"
                        inputMode="numeric"
                      />
                    </Field>

                    <Field label="Availability">
                      <Select
                        value={itemForm.is_available ? "AVAILABLE" : "UNAVAILABLE"}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, is_available: e.target.value === "AVAILABLE" }))}
                      >
                        <option value="AVAILABLE">Available</option>
                        <option value="UNAVAILABLE">Unavailable</option>
                      </Select>
                    </Field>
                  </div>
                ) : null}

                {isProductStore && premiumUnlocked && !currentItemIsImageOnly ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Availability">
                      <Select
                        value={itemForm.is_available ? "AVAILABLE" : "UNAVAILABLE"}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, is_available: e.target.value === "AVAILABLE" }))}
                      >
                        <option value="AVAILABLE">Available for pickup</option>
                        <option value="UNAVAILABLE">Unavailable</option>
                      </Select>
                    </Field>

                    <Field label="Billing">
                      <Select
                        value={itemForm.is_billable ? "BILLABLE" : "NOT_BILLABLE"}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, is_billable: e.target.value === "BILLABLE" }))}
                      >
                        <option value="NOT_BILLABLE">Not billable</option>
                        <option value="BILLABLE">Billable / orderable</option>
                      </Select>
                    </Field>
                  </div>
                ) : null}

                {isServiceStore ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Toggle
                      checked={itemForm.supports_slot_booking}
                      onChange={(checked) => setItemForm((prev) => ({ ...prev, supports_slot_booking: checked }))}
                      label="Supports slot booking"
                      description="Customers can choose a time slot for this service."
                      disabled={!premiumUnlocked}
                    />
                    <Toggle
                      checked={itemForm.is_billable}
                      onChange={(checked) => setItemForm((prev) => ({ ...prev, is_billable: checked }))}
                      label="Billable service"
                      description="Marks the service ready for payment flows."
                      disabled={!premiumUnlocked}
                    />
                  </div>
                ) : null}

                {isProductStore && premiumUnlocked && !currentItemIsImageOnly ? (
                  <div className="space-y-3">
                    <Toggle
                      checked={itemForm.track_inventory}
                      onChange={(checked) =>
                        setItemForm((prev) => ({
                          ...prev,
                          track_inventory: checked,
                          allow_backorder: checked ? prev.allow_backorder : false,
                        }))
                      }
                      label="Track inventory"
                      description="Show stock controls only when this product needs inventory management."
                    />

                    {itemForm.track_inventory ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Stock Qty">
                          <Input
                            value={itemForm.stock_qty}
                            onChange={(e) => setItemForm((prev) => ({ ...prev, stock_qty: e.target.value }))}
                            inputMode="numeric"
                            placeholder="0"
                          />
                        </Field>

                        <Field label="Low Stock Threshold">
                          <Input
                            value={itemForm.low_stock_threshold}
                            onChange={(e) =>
                              setItemForm((prev) => ({ ...prev, low_stock_threshold: e.target.value }))
                            }
                            inputMode="numeric"
                            placeholder="5"
                          />
                        </Field>

                        <div className="flex items-end">
                          <Toggle
                            checked={itemForm.allow_backorder}
                            onChange={(checked) => setItemForm((prev) => ({ ...prev, allow_backorder: checked }))}
                            label="Allow backorder"
                            description="Let orders continue after stock reaches zero."
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleSaveItem}
                  disabled={savingItem || !sortedCategories.length}
                  className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
                  style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
                >
                  {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : editingItemId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingItemId
                    ? `Save ${isServiceStore ? "Service" : "Item"}`
                    : `Add ${isServiceStore ? "Service" : currentItemIsImageOnly ? "Catalogue Entry" : "Product"}`}
                </button>

                {!sortedCategories.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Create at least one category before adding {isServiceStore ? "services" : "catalogue items"}.
                  </div>
                ) : null}
              </div>
            </Card>
            </div>
          </div>
        )}

        {loadingStores || !selectedStore ? null : isServiceStore ? (
          <Card
            title={
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-sky-600" />
                <span>Slot & Schedule Management</span>
              </div>
            }
            subtitle="Apply service slot settings to this branch, all linked branches, or a custom branch set."
          >
            {loadingData ? (
              <ServiceScheduleSkeleton />
            ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Field label="Slot Booking">
                  <Select
                    value={scheduleForm.supports_time_slots ? "ENABLED" : "DISABLED"}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        supports_time_slots: e.target.value === "ENABLED",
                      }))
                    }
                  >
                    <option value="DISABLED">Disabled</option>
                    <option value="ENABLED">Enabled</option>
                  </Select>
                </Field>

                <Field label="Slot Duration">
                  <Input
                    value={scheduleForm.slot_duration_minutes}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, slot_duration_minutes: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Buffer">
                  <Input
                    value={scheduleForm.slot_buffer_minutes}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, slot_buffer_minutes: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Advance Days">
                  <Input
                    value={scheduleForm.slot_advance_days}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, slot_advance_days: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </Field>

                <Field label="Max Per Window">
                  <Input
                    value={scheduleForm.slot_max_per_window}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, slot_max_per_window: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">Apply Scope</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    { value: "CURRENT", label: "This branch only", description: "Update only the active branch." },
                    { value: "ALL", label: "All linked branches", description: "Apply the same values to every linked service branch." },
                    { value: "CUSTOM", label: "Choose branches", description: "Pick a practical subset of linked service branches." },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={[
                        "rounded-2xl border px-4 py-3",
                        scheduleScope === option.value
                          ? "border-gray-900 bg-white"
                          : "border-gray-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="schedule-scope"
                          checked={scheduleScope === option.value}
                          onChange={() => setScheduleScope(option.value)}
                          className="mt-1"
                        />
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                          <div className="mt-1 text-xs text-gray-500">{option.description}</div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">Linked service branches</div>
                  <div className="mt-1 text-xs text-gray-500">
                    These branches come from the current partner&apos;s linked stores and are used for branch-wide slot updates.
                  </div>

                  <div className="mt-4 space-y-2">
                    {linkedServiceBranches.map((store) => {
                      const checked =
                        scheduleScope === "ALL" ||
                        (scheduleScope === "CURRENT" && String(store.id) === String(selectedStoreId)) ||
                        (scheduleScope === "CUSTOM" && scheduleTargetIds.includes(String(store.id)));

                      return (
                        <label
                          key={store.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {store.name} {store.city ? `• ${store.city}` : ""}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge tone={String(store.id) === String(selectedStoreId) ? "blue" : "gray"}>
                                {String(store.id) === String(selectedStoreId) ? "Current branch" : "Linked branch"}
                              </Badge>
                              <Badge tone={isPremiumActive(store) ? "green" : "amber"}>
                                {isPremiumActive(store) ? "Premium" : "Non-premium"}
                              </Badge>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={scheduleScope !== "CUSTOM"}
                            onChange={(e) => toggleScheduleTarget(store.id, e.target.checked)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {!premiumUnlocked ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Premium gating reminder
                  </div>
                  <div className="mt-1">
                    Slot settings can be prepared here, but the customer-facing booking flow should remain gated until this service branch is premium-enabled.
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg shadow-sky-200 disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #0f766e 0%, #0284c7 100%)" }}
              >
                {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {effectiveScheduleTargetIds.length > 1 ? "Apply To Linked Branches" : "Save Branch Schedule"}
              </button>
            </div>
            )}
          </Card>
        ) : null}

        {loadingStores || !selectedStore ? null : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card
              title={`${selectedSectionLabel} Structure`}
              subtitle="Manage categories and items with clear separation between visual-only and orderable flows."
            >
              {loadingData ? (
                <CatalogueStructureSkeleton service={isServiceStore} />
              ) : !sortedCategories.length ? (
                <EmptyState
                  title={`No ${selectedSectionLabel.toLowerCase()} categories yet`}
                  body={`Create the first ${selectedSectionLabel.toLowerCase()} category to start building the partner-facing flow.`}
                />
              ) : (
                <div className="space-y-4">
                  {sortedCategories.map((category) => {
                    const categoryItems = itemsByCategory.get(String(category.id)) || [];
                    return (
                      <div key={category.id} className="rounded-3xl border border-gray-200 bg-white p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-lg font-semibold text-gray-900">{category.title}</div>
                              <Badge tone={category.enabled !== false ? "green" : "red"}>
                                {category.enabled !== false ? "Enabled" : "Disabled"}
                              </Badge>
                              {category.starting_from !== null && category.starting_from !== undefined ? (
                                <Badge tone="blue">Starting from {money(category.starting_from)}</Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Sort order: {category.sort_order ?? 0} • {categoryItems.length} item(s)
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditCategory(category)}
                              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category)}
                              disabled={deletingCategoryId === String(category.id)}
                              className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {deletingCategoryId === String(category.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {categoryItems.length ? (
                            categoryItems.map((item) => {
                              const statusTone =
                                item.is_available === false
                                  ? "red"
                                  : item.track_inventory
                                  ? stockStatusFromQty(item.stock_qty, item.low_stock_threshold) === "low_stock"
                                    ? "amber"
                                    : stockStatusFromQty(item.stock_qty, item.low_stock_threshold) === "out_of_stock"
                                    ? "red"
                                    : "green"
                                  : "green";

                              return (
                                <div
                                  key={item.id}
                                  className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[96px_1fr_auto]"
                                >
                                  <div className="h-24 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                    {item.image_url ? (
                                      <img src={item.image_url} alt={item.title || "Catalogue"} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-semibold text-gray-900">
                                        {item.title || (item.is_image_catalogue ? "Image-only catalogue entry" : "Untitled item")}
                                      </div>
                                      <Badge tone={statusTone}>
                                        {item.is_available === false ? "Unavailable" : "Available"}
                                      </Badge>
                                      <Badge tone="gray">{item.item_type}</Badge>
                                      {item.is_image_catalogue ? <Badge tone="blue">Image-only</Badge> : null}
                                      {item.is_billable ? <Badge tone="green">Billable</Badge> : null}
                                      {item.supports_slot_booking ? <Badge tone="blue">Slot-bookable</Badge> : null}
                                      {item.track_inventory ? <Badge tone="amber">Inventory tracked</Badge> : null}
                                    </div>

                                    <div className="mt-2 text-sm text-gray-500">
                                      {item.description || "No description added yet."}
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                      {item.price !== null && item.price !== undefined ? <span>Price: {money(item.price)}</span> : null}
                                      {item.sku ? <span>SKU: {item.sku}</span> : null}
                                      {item.duration_minutes ? <span>Duration: {item.duration_minutes} mins</span> : null}
                                      {item.track_inventory ? (
                                        <span>
                                          Stock: {item.stock_qty ?? 0} • {stockStatusFromQty(item.stock_qty, item.low_stock_threshold).replaceAll("_", " ")}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditItem(item)}
                                      className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                      <Pencil className="h-4 w-4" />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(item)}
                                      disabled={deletingItemId === String(item.id)}
                                      className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                                    >
                                      {deletingItemId === String(item.id) ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <EmptyState
                              title="No items in this category"
                              body={`Use the ${isServiceStore ? "service" : "item"} form to add entries here.`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              title={
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-violet-600" />
                  <span>Preview Mode</span>
                </div>
              }
              subtitle={
                isServiceStore
                  ? "Customer-facing service menu preview with duration, billing, and slot-booking indicators."
                  : premiumUnlocked
                  ? "Customer-facing pickup catalogue preview for full products and image-only entries."
                  : "Customer-facing image catalogue preview for non-premium product stores."
              }
            >
              {loadingData ? (
                <CatalogueStructureSkeleton service={isServiceStore} />
              ) : !previewCategories.length ? (
                <EmptyState
                  title="Nothing to preview yet"
                  body={`Enabled categories with available ${isServiceStore ? "services" : "items"} will appear here.`}
                />
              ) : (
                <div className="space-y-5">
                  {previewCategories.map((category) => (
                    <div key={category.id} className="rounded-3xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900">{category.title}</div>
                        {category.starting_from !== null && category.starting_from !== undefined ? (
                          <Badge tone="blue">Starting from {money(category.starting_from)}</Badge>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-3">
                        {category.items.map((item) =>
                          isServiceStore ? (
                            <div
                              key={item.id}
                              className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[84px_1fr]"
                            >
                              <div className="h-20 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.title || "Service"} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                                )}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-semibold text-gray-900">{item.title}</div>
                                  {item.price !== null && item.price !== undefined ? <Badge tone="green">{money(item.price)}</Badge> : null}
                                  {item.duration_minutes ? <Badge tone="blue">{item.duration_minutes} mins</Badge> : null}
                                  {item.supports_slot_booking ? <Badge tone="blue">Slot-bookable</Badge> : null}
                                  {item.is_billable ? <Badge tone="green">Billable</Badge> : null}
                                </div>
                                <div className="mt-2 text-sm text-gray-500">{item.description || "No description added yet."}</div>
                              </div>
                            </div>
                          ) : premiumUnlocked && !item.is_image_catalogue ? (
                            <div
                              key={item.id}
                              className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[96px_1fr_auto]"
                            >
                              <div className="h-24 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.title || "Product"} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900">{item.title}</div>
                                <div className="mt-2 text-sm text-gray-500">{item.description || "No description added yet."}</div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {item.price !== null && item.price !== undefined ? <Badge tone="green">{money(item.price)}</Badge> : null}
                                {item.is_billable ? <Badge tone="green">Ready for pickup order flow</Badge> : null}
                              </div>
                            </div>
                          ) : (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-gray-200 bg-gray-50 p-3"
                            >
                              <div className="aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.title || "Catalogue image"} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                                )}
                              </div>
                              {(item.title || item.price !== null) ? (
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="text-sm font-medium text-gray-900">{item.title || "Image-only entry"}</div>
                                  {item.price !== null && item.price !== undefined ? <div className="text-sm text-gray-500">{money(item.price)}</div> : null}
                                </div>
                              ) : null}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {loadingStores ? null : !stores.length ? null : (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">Flow Summary</div>
                <div className="mt-2 text-sm text-gray-600">
                  {isProductStore && !premiumUnlocked
                    ? "This branch is correctly constrained to image-only catalogue behavior. Price, billing, and inventory stay optional or hidden."
                    : isProductStore
                    ? "This branch is ready for full product catalogue management, pickup ordering readiness, and optional inventory controls."
                    : premiumUnlocked
                    ? "This branch is ready for service menu publishing, slot booking readiness, and billable service setup."
                    : "This branch can publish a service menu now while premium-only slot booking and payment readiness remain clearly gated."}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
