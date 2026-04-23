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
  Eye,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
} from "lucide-react";

const BUCKET_NAME = "stores";
const SERVICE_MENU_ASSET_TYPE = "service_menu";
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
      service_for: "MEN",
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
    service_for: "",
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

function findCategoryByTitle(categories, title) {
  const clean = String(title || "").trim().toLowerCase();
  if (!clean) return null;
  return categories.find((category) => String(category.title || "").trim().toLowerCase() === clean) || null;
}

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
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
  const serviceMenuFileRef = useRef(null);

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

  const [serviceMenuAssets, setServiceMenuAssets] = useState([]);
  const [serviceCategoryChoices, setServiceCategoryChoices] = useState([]);
  const [selectedServiceCategoryTitles, setSelectedServiceCategoryTitles] = useState([]);
  const [expandedServiceCategoryIds, setExpandedServiceCategoryIds] = useState([]);
  const [activeServiceFormCategoryId, setActiveServiceFormCategoryId] = useState("");
  const [savingServiceCategories, setSavingServiceCategories] = useState(false);
  const [newServiceMenuFiles, setNewServiceMenuFiles] = useState([]);
  const [savingServiceMenuAssets, setSavingServiceMenuAssets] = useState(false);

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

  const serviceCategoryOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    (serviceCategoryChoices || []).forEach((choice) => {
      const title = String(choice?.title || "").trim();
      const key = normalizeTitle(title);
      if (!title || !key || seen.has(key)) return;
      seen.add(key);
      options.push({
        title,
        image_url: String(choice?.image_url || ""),
      });
    });
    return options;
  }, [serviceCategoryChoices]);

  const selectedServiceCategorySet = useMemo(
    () => new Set((selectedServiceCategoryTitles || []).map((value) => normalizeTitle(value)).filter(Boolean)),
    [selectedServiceCategoryTitles]
  );

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

  const newServiceMenuPreviews = useMemo(
    () =>
      newServiceMenuFiles.map((file, index) => ({
        key: `${file.name}_${index}_${file.lastModified || ""}`,
        file,
        url: URL.createObjectURL(file),
      })),
    [newServiceMenuFiles]
  );

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
      setServiceMenuAssets([]);
      setServiceCategoryChoices([]);
      setSelectedServiceCategoryTitles([]);
      setExpandedServiceCategoryIds([]);
      setActiveServiceFormCategoryId("");
      setNewServiceMenuFiles([]);
      return;
    }

    setLoadingData(true);
    try {
      const [categoryRes, itemRes, serviceMenuRes, serviceCategoriesRes] = await Promise.all([
        supabaseBrowser
          .from("store_catalogue_categories")
          .select("id,store_id,title,starting_from,enabled,sort_order,created_at,updated_at")
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabaseBrowser
          .from("store_catalogue_items")
          .select(
            "id,store_id,category_id,title,description,price,sku,service_for,is_available,item_type,is_billable,duration_minutes,supports_slot_booking,track_inventory,stock_qty,low_stock_threshold,stock_status,allow_backorder,is_image_catalogue,sort_order,created_at,updated_at"
          )
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabaseBrowser
          .from("store_media_assets")
          .select("id,store_id,asset_type,file_url,file_path,sort_order,is_active,created_at")
          .eq("store_id", storeId)
          .eq("asset_type", SERVICE_MENU_ASSET_TYPE)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabaseBrowser
          .from("service_categories")
          .select("title,image_url")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true }),
      ]);

      if (categoryRes.error) throw categoryRes.error;
      if (itemRes.error) throw itemRes.error;
      if (serviceMenuRes.error) throw serviceMenuRes.error;
      if (serviceCategoriesRes.error) throw serviceCategoriesRes.error;

      const loadedCategories = categoryRes.data || [];
      const loadedItems = (itemRes.data || []).map((item) => ({
        ...item,
        item_type: normalizeStoreType(item.item_type),
        stock_qty: item.stock_qty ?? null,
        low_stock_threshold: item.low_stock_threshold ?? 5,
      }));

      setCategories(loadedCategories);
      setItems(loadedItems);
      setServiceMenuAssets(serviceMenuRes.data || []);
      setServiceCategoryChoices(
        Array.from(
          new Set(
            (serviceCategoriesRes.data || []).map((row) => JSON.stringify({
              title: String(row?.title || "").trim(),
              image_url: String(row?.image_url || ""),
            }))
          )
        ).map((raw) => JSON.parse(raw)).filter((row) => row.title)
      );
      setNewServiceMenuFiles([]);

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
    return () => {
      newServiceMenuPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [newServiceMenuPreviews]);

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

  useEffect(() => {
    if (!isServiceStore) {
      setSelectedServiceCategoryTitles([]);
      setExpandedServiceCategoryIds([]);
      return;
    }

    const selectedTitles = sortedCategories
      .map((category) => String(category.title || "").trim())
      .filter(Boolean);
    setSelectedServiceCategoryTitles(selectedTitles);
    setExpandedServiceCategoryIds((prev) => {
      const next = prev.filter((id) =>
        sortedCategories.some((category) => String(category.id) === String(id))
      );
      if (next.length || !sortedCategories.length) return next;
      return [String(sortedCategories[0].id)];
    });
  }, [isServiceStore, sortedCategories]);

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
    setActiveServiceFormCategoryId("");
    setItemForm({
      ...getInitialItemForm(selectedStoreType),
      category_title: sortedCategories[0]?.title ? String(sortedCategories[0].title) : "",
    });
  };

  const toggleServiceCategorySelection = (title, checked) => {
    const normalized = normalizeTitle(title);
    if (!normalized) return;

    setSelectedServiceCategoryTitles((prev) => {
      const next = new Map();
      prev.forEach((value) => {
        const key = normalizeTitle(value);
        if (key) next.set(key, value);
      });
      if (checked) next.set(normalized, title);
      else next.delete(normalized);
      return Array.from(next.values());
    });
  };

  const handleSaveServiceCategories = async () => {
    if (!selectedStoreId || !isServiceStore) return;

    const selectedNormalized = new Set(
      (selectedServiceCategoryTitles || []).map((value) => normalizeTitle(value)).filter(Boolean)
    );
    if (!selectedNormalized.size) {
      toast.error("Select at least one category for this service store.");
      return;
    }

    const categoriesToAdd = serviceCategoryOptions
      .map((option) => String(option.title || "").trim())
      .filter(
        (title) =>
          selectedNormalized.has(normalizeTitle(title)) &&
          !sortedCategories.some((category) => normalizeTitle(category.title) === normalizeTitle(title))
      );

    const categoriesToRemove = sortedCategories.filter(
      (category) => !selectedNormalized.has(normalizeTitle(category.title))
    );

    const blocked = categoriesToRemove.filter((category) =>
      items.some((item) => String(item.category_id) === String(category.id))
    );
    if (blocked.length) {
      toast.error(`Remove services from "${blocked[0].title}" before unselecting that category.`);
      return;
    }

    try {
      setSavingServiceCategories(true);

      if (categoriesToAdd.length) {
        const rows = categoriesToAdd.map((title) => ({
          store_id: selectedStoreId,
          title,
          starting_from: null,
          enabled: true,
            sort_order: Math.max(
              0,
            serviceCategoryOptions.findIndex((option) => normalizeTitle(option?.title) === normalizeTitle(title))
            ),
        }));
        const { error } = await supabaseBrowser.from("store_catalogue_categories").insert(rows);
        if (error) throw error;
      }

      for (const category of categoriesToRemove) {
        const { error } = await supabaseBrowser
          .from("store_catalogue_categories")
          .delete()
          .eq("id", category.id);
        if (error) throw error;
      }

      await loadCatalogueData(selectedStoreId);
      toast.success("Service categories updated.");
    } catch (error) {
      toast.error(error?.message || "Failed to update service categories.");
    } finally {
      setSavingServiceCategories(false);
    }
  };

  const toggleServiceCategoryPanel = (categoryId) => {
    setExpandedServiceCategoryIds((prev) =>
      prev.includes(String(categoryId))
        ? prev.filter((id) => String(id) !== String(categoryId))
        : [...prev, String(categoryId)]
    );
  };

  const startServiceForCategory = (category) => {
    setEditingItemId("");
    setItemImageFiles([]);
    setItemImagePreviewUrls([]);
    setActiveServiceFormCategoryId(String(category.id));
    setItemForm((prev) => ({
      ...getInitialItemForm("SERVICE"),
      category_title: category?.title || prev.category_title || "",
      is_available: true,
    }));
    setExpandedServiceCategoryIds((prev) =>
      prev.includes(String(category.id)) ? prev : [...prev, String(category.id)]
    );
    itemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (isServiceStore && !String(itemForm.service_for || "").trim()) return "Select Men or Women.";

    if (isProductStore && premiumUnlocked && !currentItemIsImageOnly && !itemForm.title.trim()) {
      return "Full product items need a title.";
    }

    if (isProductStore && premiumUnlocked && !currentItemIsImageOnly && itemForm.is_billable && price === null) {
      return "Billable products need a price.";
    }

    if (isServiceStore && duration !== null && duration <= 0) {
      return "Duration should be greater than 0 minutes.";
    }

    if (isServiceStore && (price === null || price < 0)) {
      return "Service price is required.";
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
      const matchedCategoryId = String(matchedCategory.id);

      const price = safeNum(itemForm.price);
      const duration = safeNum(itemForm.duration_minutes);
      const stockQty = Math.max(0, Number(itemForm.stock_qty || 0));
      const lowThreshold = Math.max(0, Number(itemForm.low_stock_threshold || 5));

      let payload;

      if (isProductStore) {
        const imageOnly = !premiumUnlocked || Boolean(itemForm.is_image_catalogue);
        const trackInventory = premiumUnlocked && !imageOnly && Boolean(itemForm.track_inventory);

        payload = {
          store_id: selectedStoreId,
          category_id: matchedCategory.id,
          item_type: "PRODUCT",
          service_for: null,
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
          service_for: String(itemForm.service_for || "").trim() || null,
          title: itemForm.title.trim(),
          price,
          description: asText(itemForm.description),
          sku: null,
          is_available: true,
          is_billable: false,
          duration_minutes: duration,
          supports_slot_booking: false,
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
        const rows = [
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

      const categoryAfterSave = itemForm.category_title;
      await loadCatalogueData(selectedStoreId);
      if (isServiceStore) {
        setEditingItemId("");
        setItemImageFiles([]);
        setItemImagePreviewUrls([]);
        setItemForm({
          ...getInitialItemForm("SERVICE"),
          category_title: categoryAfterSave,
          is_available: true,
        });
        setActiveServiceFormCategoryId(matchedCategoryId);
      } else {
        resetItemForm();
      }
    } catch (error) {
      toast.error(error?.message || "Failed to save item.");
    } finally {
      setSavingItem(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(String(item.id));
    setItemImageFiles([]);
    setItemImagePreviewUrls(isProductStore && item.image_url ? [item.image_url] : []);
    const linkedCategory = categories.find((category) => String(category.id) === String(item.category_id));
    if (isServiceStore && linkedCategory?.id) {
      setActiveServiceFormCategoryId(String(linkedCategory.id));
      setExpandedServiceCategoryIds((prev) =>
        prev.includes(String(linkedCategory.id)) ? prev : [...prev, String(linkedCategory.id)]
      );
    }
    setItemForm({
      category_title: linkedCategory?.title || "",
      title: item.title || "",
      description: item.description || "",
      price: item.price ?? "",
      service_for: item.service_for || (isServiceStore ? "MEN" : ""),
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

  const handleToggleItemAvailability = async (item) => {
    try {
      const { error } = await supabaseBrowser
        .from("store_catalogue_items")
        .update({ is_available: item.is_available === false })
        .eq("id", item.id);
      if (error) throw error;

      setItems((prev) =>
        prev.map((row) =>
          String(row.id) === String(item.id)
            ? { ...row, is_available: row.is_available === false }
            : row
        )
      );
      toast.success(item.is_available === false ? "Service is now active." : "Service is now inactive.");
    } catch (error) {
      toast.error(error?.message || "Failed to update service status.");
    }
  };

  const uploadServiceMenuImage = async (storeId, file) => {
    const ext = getExt(file);
    const path = `store-media/${storeId}/service-menu/${uid()}.${ext}`;

    const { error } = await supabaseBrowser.storage.from(BUCKET_NAME).upload(path, file, {
      upsert: false,
      contentType: file?.type || undefined,
    });
    if (error) throw error;

    const { data } = supabaseBrowser.storage.from(BUCKET_NAME).getPublicUrl(path);
    return {
      id: uid(),
      file_url: data?.publicUrl || "",
      file_path: path,
      sort_order: 100,
      is_active: true,
    };
  };

  const onPickServiceMenuFiles = (event) => {
    const incoming = Array.from(event.target.files || []).filter(isImage);
    if (!incoming.length) {
      toast.error("Select image files for service menu.");
      return;
    }
    setNewServiceMenuFiles((prev) => [...prev, ...incoming]);
    event.target.value = "";
  };

  const removeExistingServiceMenuAsset = (index) => {
    setServiceMenuAssets((prev) => prev.filter((_, idx) => idx !== index));
  };

  const removeNewServiceMenuFile = (index) => {
    setNewServiceMenuFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveServiceMenuAssets = async () => {
    if (!selectedStoreId || !isServiceStore || savingServiceMenuAssets) return;

    try {
      setSavingServiceMenuAssets(true);

      const uploadedAssets = newServiceMenuFiles.length
        ? await Promise.all(newServiceMenuFiles.map((file) => uploadServiceMenuImage(selectedStoreId, file)))
        : [];

      const merged = [...serviceMenuAssets, ...uploadedAssets].filter((asset) => asset?.file_url);
      const deduped = [];
      const seen = new Set();
      merged.forEach((asset) => {
        const key = String(asset.file_url || "").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(asset);
      });

      const deleteRes = await supabaseBrowser
        .from("store_media_assets")
        .delete()
        .eq("store_id", selectedStoreId)
        .eq("asset_type", SERVICE_MENU_ASSET_TYPE);
      if (deleteRes.error) throw deleteRes.error;

      if (deduped.length) {
        const { error } = await supabaseBrowser.from("store_media_assets").insert(
          deduped.map((asset, index) => ({
            store_id: selectedStoreId,
            asset_type: SERVICE_MENU_ASSET_TYPE,
            file_url: asset.file_url,
            file_path: asset.file_path || null,
            sort_order: index,
            is_active: true,
          }))
        );
        if (error) throw error;
      }

      const normalized = deduped.map((asset, index) => ({
        ...asset,
        sort_order: index,
        is_active: true,
      }));
      setServiceMenuAssets(normalized);
      setNewServiceMenuFiles([]);
      toast.success("Service menu images updated.");
    } catch (error) {
      toast.error(error?.message || "Failed to update service menu images.");
    } finally {
      setSavingServiceMenuAssets(false);
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
    ? "Configure service categories, add services, and publish service menu images."
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Content</div>
                  <div className="mt-3 text-lg font-semibold text-gray-900">
                    {categories.length} categories
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{items.length} items configured</div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {loadingStores || !selectedStore ? null : isServiceStore ? (
          <Card
            title="Select Services"
            subtitle="Select all services this store provides, then open each category below to add services."
          >
            {loadingData ? (
              <CatalogueEditorSkeleton service />
            ) : !serviceCategoryOptions.length ? (
              <EmptyState
                title="No service categories found"
                body="Add active entries in service_categories first, then return here."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {serviceCategoryOptions.map((option) => {
                    const checked = selectedServiceCategorySet.has(normalizeTitle(option.title));
                    return (
                      <label
                        key={option.title}
                        className={[
                          "group cursor-pointer rounded-2xl border p-3 transition",
                          checked ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-14 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                            {option.image_url ? (
                              <img src={option.image_url} alt={option.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">No image</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-gray-900">{option.title}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleServiceCategorySelection(option.title, e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveServiceCategories}
                    disabled={savingServiceCategories}
                    className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
                    style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
                  >
                    {savingServiceCategories ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Selected Services
                  </button>
                  <span className="text-sm text-gray-500">Next: open a category below and click Add Service.</span>
                </div>
              </div>
            )}
          </Card>
        ) : (
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
                  <CatalogueEditorSkeleton service={false} />
                ) : (
                  <div className="space-y-4">
                    <Field label="Category Title">
                      <Input
                        value={categoryForm.title}
                        onChange={(e) => setCategoryForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="New Arrivals"
                      />
                    </Field>

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
                title="Item Form"
                subtitle={
                  premiumUnlocked
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
                  </div>

                  <Field label="Image" hint="Required">
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
                          multiple={currentItemIsImageOnly && !editingItemId}
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

                      {currentItemIsImageOnly && !editingItemId ? (
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
                    <Field label={currentItemIsImageOnly ? "Title (optional)" : "Title"}>
                      <Input
                        value={itemForm.title}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Canvas Tote Bag"
                      />
                    </Field>

                    <Field label={currentItemIsImageOnly ? "Price (optional)" : itemForm.is_billable ? "Price" : "Price (optional)"}>
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
                      placeholder="Short description for customers."
                    />
                  </Field>

                  {premiumUnlocked && !currentItemIsImageOnly ? (
                    <Field label="SKU">
                      <Input
                        value={itemForm.sku}
                        onChange={(e) => setItemForm((prev) => ({ ...prev, sku: e.target.value }))}
                        placeholder="Optional SKU"
                      />
                    </Field>
                  ) : null}

                  {premiumUnlocked && !currentItemIsImageOnly ? (
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

                  {premiumUnlocked && !currentItemIsImageOnly ? (
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
                    {editingItemId ? "Save Item" : currentItemIsImageOnly ? "Add Catalogue Entry" : "Add Product"}
                  </button>

                  {!sortedCategories.length ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Create at least one category before adding catalogue items.
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>
        )}

        {loadingStores || !selectedStore ? null : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card
              title={isServiceStore ? "Services" : `${selectedSectionLabel} Structure`}
              subtitle={
                isServiceStore
                  ? "Open a category, add services, and manage each service in place."
                  : "Manage categories and items with clear separation between visual-only and orderable flows."
              }
            >
              {loadingData ? (
                <CatalogueStructureSkeleton service={isServiceStore} />
              ) : !sortedCategories.length ? (
                <EmptyState
                  title={isServiceStore ? "No service categories selected" : `No ${selectedSectionLabel.toLowerCase()} categories yet`}
                  body={
                    isServiceStore
                      ? "Select categories in Service Categories, then save to start adding services."
                      : `Create the first ${selectedSectionLabel.toLowerCase()} category to start building the partner-facing flow.`
                  }
                />
              ) : (
                <div className="space-y-4">
                  {sortedCategories.map((category) => {
                    const categoryItems = itemsByCategory.get(String(category.id)) || [];
                    const isExpanded = expandedServiceCategoryIds.includes(String(category.id));

                    return (
                      <div key={category.id} className="rounded-3xl border border-gray-200 bg-white p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-lg font-semibold text-gray-900">{category.title}</div>
                              <Badge tone={categoryItems.length ? "green" : "gray"}>
                                {categoryItems.length} service{categoryItems.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                            <div className="mt-2 text-sm text-gray-500">Sort order: {category.sort_order ?? 0}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isServiceStore ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startServiceForCategory(category)}
                                  className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add Service
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleServiceCategoryPanel(category.id)}
                                  className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  {isExpanded ? "Collapse" : "Open"}
                                </button>
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>

                        {!isServiceStore || isExpanded ? (
                          <div className="mt-4 space-y-3">
                            {isServiceStore && activeServiceFormCategoryId === String(category.id) ? (
                              <div ref={itemFormRef} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-4 flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {editingItemId ? "Edit Service" : `Add Service in ${category.title}`}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={resetItemForm}
                                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <Field label="Title *">
                                    <Input
                                      value={itemForm.title}
                                      onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))}
                                      placeholder="Classic Haircut"
                                    />
                                  </Field>
                                  <Field label="Price *">
                                    <Input
                                      value={itemForm.price}
                                      onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))}
                                      placeholder="0.00"
                                      inputMode="decimal"
                                    />
                                  </Field>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <Field label="For">
                                    <Select
                                      value={itemForm.service_for}
                                      onChange={(e) =>
                                        setItemForm((prev) => ({ ...prev, service_for: e.target.value }))
                                      }
                                    >
                                      <option value="MEN">Men</option>
                                      <option value="WOMEN">Women</option>
                                    </Select>
                                  </Field>
                                  <Field label="Approx. Time (mins)">
                                    <Input
                                      value={itemForm.duration_minutes}
                                      onChange={(e) =>
                                        setItemForm((prev) => ({ ...prev, duration_minutes: e.target.value }))
                                      }
                                      placeholder="30"
                                      inputMode="numeric"
                                    />
                                  </Field>
                                </div>

                                <div className="mt-4">
                                  <Field label="Description">
                                    <Textarea
                                      value={itemForm.description}
                                      onChange={(e) =>
                                        setItemForm((prev) => ({ ...prev, description: e.target.value }))
                                      }
                                      placeholder="Short description of what this service includes."
                                    />
                                  </Field>
                                </div>

                                <button
                                  type="button"
                                  onClick={handleSaveItem}
                                  disabled={savingItem}
                                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-60"
                                  style={{
                                    background:
                                      "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
                                  }}
                                >
                                  {savingItem ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : editingItemId ? (
                                    <Save className="h-4 w-4" />
                                  ) : (
                                    <Plus className="h-4 w-4" />
                                  )}
                                  {editingItemId ? "Save Service" : "Add Service"}
                                </button>
                              </div>
                            ) : null}

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
                                    className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_auto]"
                                  >
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-semibold text-gray-900">
                                          {item.title || (item.is_image_catalogue ? "Image-only catalogue entry" : "Untitled item")}
                                        </div>
                                        <Badge tone={statusTone}>
                                          {item.is_available === false ? "Inactive" : "Active"}
                                        </Badge>
                                        {isServiceStore && item.service_for ? (
                                          <Badge tone="blue">{String(item.service_for).toUpperCase()}</Badge>
                                        ) : null}
                                        {!isServiceStore ? <Badge tone="gray">{item.item_type}</Badge> : null}
                                        {item.is_image_catalogue ? <Badge tone="blue">Image-only</Badge> : null}
                                        {!isServiceStore && item.is_billable ? <Badge tone="green">Billable</Badge> : null}
                                        {!isServiceStore && item.track_inventory ? <Badge tone="amber">Inventory tracked</Badge> : null}
                                      </div>

                                      <div className="mt-2 text-sm text-gray-500">
                                        {item.description || "No description added yet."}
                                      </div>

                                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                        {item.price !== null && item.price !== undefined ? <span>Price: {money(item.price)}</span> : null}
                                        {item.duration_minutes ? <span>Approx. time: {item.duration_minutes} mins</span> : null}
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-start justify-end gap-2">
                                      {isServiceStore ? (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleItemAvailability(item)}
                                          className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                          {item.is_available === false ? "Activate" : "Deactivate"}
                                        </button>
                                      ) : null}
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
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {isServiceStore ? (
              <Card
                title={
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-5 w-5 text-violet-600" />
                    <span>Service Menu Images</span>
                  </div>
                }
                subtitle="Upload service menu images."
                right={
                  <button
                    type="button"
                    onClick={() => serviceMenuFileRef.current?.click()}
                    disabled={savingServiceMenuAssets}
                    className="inline-flex h-9 w-40 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Add Images
                  </button>
                }
              >
                <input
                  ref={serviceMenuFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onPickServiceMenuFiles}
                />

                <div className="space-y-4">
                  {loadingData ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <SkeletonBlock key={idx} className="h-24 w-full rounded-2xl border-gray-200 bg-gray-100" />
                      ))}
                    </div>
                  ) : serviceMenuAssets.length || newServiceMenuPreviews.length ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {serviceMenuAssets.map((asset, idx) => (
                        <div key={`existing_${asset.id || idx}`} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-2">
                          <img src={asset.file_url} alt={`Service menu ${idx + 1}`} className="h-24 w-full rounded-xl object-cover" />
                          <button
                            type="button"
                            onClick={() => removeExistingServiceMenuAsset(idx)}
                            disabled={savingServiceMenuAssets}
                            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      {newServiceMenuPreviews.map((preview, idx) => (
                        <div key={`new_${preview.key}`} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-2">
                          <img src={preview.url} alt={preview.file.name || `New service menu ${idx + 1}`} className="h-24 w-full rounded-xl object-cover" />
                          <button
                            type="button"
                            onClick={() => removeNewServiceMenuFile(idx)}
                            disabled={savingServiceMenuAssets}
                            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No service menu images yet" body="Add images to build your service menu gallery." />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveServiceMenuAssets}
                      disabled={savingServiceMenuAssets || loadingData}
                      className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-60"
                      style={{
                        background:
                          "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
                      }}
                    >
                      {savingServiceMenuAssets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Menu Images
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card
                title={
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-violet-600" />
                    <span>Preview Mode</span>
                  </div>
                }
                subtitle={
                  premiumUnlocked
                    ? "Customer-facing pickup catalogue preview for full products and image-only entries."
                    : "Customer-facing image catalogue preview for non-premium product stores."
                }
              >
                {loadingData ? (
                  <CatalogueStructureSkeleton service={false} />
                ) : !previewCategories.length ? (
                  <EmptyState
                    title="Nothing to preview yet"
                    body="Enabled categories with available items will appear here."
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
                            premiumUnlocked && !item.is_image_catalogue ? (
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
            )}
          </div>
        )}

      </div>
    </div>
  );
}
