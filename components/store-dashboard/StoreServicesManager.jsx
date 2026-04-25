"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, RefreshCw, Save, Settings2, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function normalizeStoreType(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "service" ? "SERVICE" : "PRODUCT";
}

function asNum(v, fallback = null) {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asText(v) {
  const t = String(v || "").trim();
  return t || null;
}

function normalizeKey(v) {
  return String(v || "").trim().toLowerCase();
}

function emptyItemForm(sortOrder = 1) {
  return {
    title: "",
    duration_minutes: "",
    description: "",
    price: "",
    service_for: "MEN",
    is_active: true,
    sort_order: String(sortOrder),
  };
}

function Field({ label, children, hint }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-gray-500">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Badge({ value }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
        value !== false
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      {value !== false ? "Active" : "Inactive"}
    </span>
  );
}

function findServiceForCategory(services, category) {
  const categoryId = normalizeKey(category?.id);
  const categorySlug = normalizeKey(category?.slug);
  const categoryKey = normalizeKey(category?.key);
  const categoryTitle = normalizeKey(category?.title);

  return (
    services.find((service) => {
      const meta = service?.metadata && typeof service.metadata === "object" ? service.metadata : {};
      const metaCategoryId = normalizeKey(meta.category_id);
      const serviceSlug = normalizeKey(service?.slug);
      const serviceCategory = normalizeKey(service?.category);
      const serviceTitle = normalizeKey(service?.title);

      if (metaCategoryId && categoryId && metaCategoryId === categoryId) return true;
      if (serviceSlug && categorySlug && serviceSlug === categorySlug) return true;
      if (serviceCategory && categoryKey && serviceCategory === categoryKey) return true;
      if (serviceTitle && categoryTitle && serviceTitle === categoryTitle) return true;
      return false;
    }) || null
  );
}

function categoryFromService(service, categories) {
  if (!service) return null;

  const meta = service?.metadata && typeof service.metadata === "object" ? service.metadata : {};
  const byId = categories.find((category) => normalizeKey(category.id) === normalizeKey(meta.category_id));
  if (byId) return byId;

  const bySlug = categories.find((category) => normalizeKey(category.slug) === normalizeKey(service.slug));
  if (bySlug) return bySlug;

  const byKey = categories.find((category) => normalizeKey(category.key) === normalizeKey(service.category));
  if (byKey) return byKey;

  const byTitle = categories.find((category) => normalizeKey(category.title) === normalizeKey(service.title));
  if (byTitle) return byTitle;

  return null;
}

export default function StoreServicesManager({ storeId, storeType }) {
  const isServiceStore = normalizeStoreType(storeType) === "SERVICE";

  const [loading, setLoading] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [busyItemId, setBusyItemId] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [categories, setCategories] = useState([]);
  const [storeServices, setStoreServices] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);

  const [checkedCategoryIds, setCheckedCategoryIds] = useState([]);
  const [activeServiceId, setActiveServiceId] = useState("");
  const [showCategoryConfigurator, setShowCategoryConfigurator] = useState(true);

  const [editingItemId, setEditingItemId] = useState("");
  const [form, setForm] = useState(emptyItemForm());

  const itemCountByService = useMemo(() => {
    const map = new Map();
    serviceItems.forEach((item) => {
      const key = String(item.service_id || "");
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [serviceItems]);

  const serviceCategoryRows = useMemo(() => {
    const rows = storeServices.map((service) => {
      const category = categoryFromService(service, categories);
      return {
        service,
        category,
        label: category?.title || service.title || "Untitled category",
        subtitle: category?.subtitle || category?.description || service?.description || "No description added.",
        sort_order: Number(service?.sort_order ?? category?.sort_order ?? 0),
        count: itemCountByService.get(String(service.id)) || 0,
      };
    });

    return rows.sort((a, b) => {
      const bySort = a.sort_order - b.sort_order;
      if (bySort !== 0) return bySort;
      return String(a.label).localeCompare(String(b.label));
    });
  }, [categories, itemCountByService, storeServices]);

  const categoryIds = useMemo(() => categories.map((category) => String(category.id)), [categories]);

  const allCategoriesChecked =
    categoryIds.length > 0 && categoryIds.every((categoryId) => checkedCategoryIds.includes(categoryId));

  const activeItems = useMemo(() => {
    if (!activeServiceId) return [];
    return serviceItems
      .filter((item) => String(item.service_id || "") === String(activeServiceId))
      .sort((a, b) => {
        const bySort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (bySort !== 0) return bySort;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [activeServiceId, serviceItems]);

  const loadData = async () => {
    if (!storeId || !isServiceStore) return;

    setLoading(true);
    setError("");

    try {
      const [categoriesRes, servicesRes, itemsRes] = await Promise.all([
        supabaseBrowser
          .from("service_categories")
          .select("id,key,slug,title,subtitle,description,image_url,sort_order,selection_type,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true }),
        supabaseBrowser
          .from("store_services")
          .select(
            "id,store_id,slug,title,description,category,service_type,duration_minutes,base_price,currency_code,is_active,is_featured,sort_order,metadata,created_at,updated_at"
          )
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabaseBrowser
          .from("store_service_items")
          .select(
            "id,store_id,service_id,title,description,price,currency_code,duration_minutes,service_for,is_active,sort_order,created_at,updated_at"
          )
          .eq("store_id", storeId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const loadedCategories = categoriesRes.data || [];
      const loadedServices = servicesRes.data || [];
      const loadedItems = itemsRes.data || [];

      setCategories(loadedCategories);
      setStoreServices(loadedServices);
      setServiceItems(loadedItems);

      const savedCategoryIds = loadedServices
        .map((service) => categoryFromService(service, loadedCategories)?.id)
        .filter(Boolean)
        .map((id) => String(id));

      setCheckedCategoryIds((prev) => {
        const valid = prev.filter((id) => loadedCategories.some((category) => String(category.id) === String(id)));
        if (valid.length) return valid;
        return savedCategoryIds;
      });

      setActiveServiceId((prev) => {
        if (prev && loadedServices.some((service) => String(service.id) === String(prev))) return prev;
        return loadedServices[0]?.id ? String(loadedServices[0].id) : "";
      });

      setShowCategoryConfigurator(loadedServices.length === 0);
    } catch (e) {
      setError(e?.message || "Failed to load services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCategories([]);
    setStoreServices([]);
    setServiceItems([]);
    setCheckedCategoryIds([]);
    setActiveServiceId("");
    setEditingItemId("");
    setForm(emptyItemForm());
    setShowCategoryConfigurator(true);
    setError("");
    setSuccess("");

    if (isServiceStore && storeId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServiceStore, storeId]);

  useEffect(() => {
    if (!activeServiceId || !storeServices.length || !categories.length) return;

    const current = storeServices.find((service) => String(service.id) === String(activeServiceId));
    if (!current) return;

    const linkedCategory = categoryFromService(current, categories);
    if (!linkedCategory?.id) return;

    const linkedCategoryId = String(linkedCategory.id);
    setCheckedCategoryIds((prev) => (prev.includes(linkedCategoryId) ? prev : [...prev, linkedCategoryId]));
  }, [activeServiceId, categories, storeServices]);

  if (!isServiceStore) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const getNextItemSortOrder = (serviceId) => {
    const key = String(serviceId || "");
    if (!key) return 1;
    const maxSort = serviceItems
      .filter((item) => String(item.service_id || "") === key)
      .reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    return maxSort + 1;
  };

  const resetItemForm = (serviceId = activeServiceId) => {
    setEditingItemId("");
    setForm(emptyItemForm(getNextItemSortOrder(serviceId)));
  };

  const toggleCategoryChecked = (categoryId) => {
    const key = String(categoryId);
    setCheckedCategoryIds((prev) => (prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]));
  };

  const toggleAllCategories = (checked) => {
    if (!checked) {
      setCheckedCategoryIds([]);
      return;
    }
    setCheckedCategoryIds(categoryIds);
  };

  const ensureCategoryService = async (category, currentServices) => {
    const existing = findServiceForCategory(currentServices, category);
    if (existing?.id) return { service: existing, allServices: currentServices, created: false };

    const selectFields =
      "id,store_id,slug,title,description,category,service_type,duration_minutes,base_price,currency_code,is_active,is_featured,sort_order,metadata,created_at,updated_at";

    const payload = {
      store_id: storeId,
      slug: category.slug || null,
      title: category.title,
      description: category.description || null,
      category: category.key || null,
      service_type: null,
      duration_minutes: null,
      base_price: 0,
      currency_code: "MUR",
      is_active: true,
      is_featured: false,
      sort_order:
        currentServices.reduce((max, service) => Math.max(max, Number(service.sort_order || 0)), 0) + 1,
      metadata: {
        category_id: category.id,
        category_key: category.key,
        category_slug: category.slug,
        category_title: category.title,
        selection_type: category.selection_type || "MULTI",
      },
    };

    const { data, error: insertError } = await supabaseBrowser
      .from("store_services")
      .insert(payload)
      .select(selectFields)
      .single();

    if (!insertError && data?.id) {
      const nextServices = [...currentServices, data];
      return { service: data, allServices: nextServices, created: true };
    }

    const isDuplicate = String(insertError?.code || "") === "23505";
    if (!isDuplicate) throw insertError;

    let fallbackQuery = supabaseBrowser.from("store_services").select(selectFields).eq("store_id", storeId);
    if (category.slug) fallbackQuery = fallbackQuery.eq("slug", category.slug);
    else if (category.key) fallbackQuery = fallbackQuery.eq("category", category.key);
    else fallbackQuery = fallbackQuery.eq("title", category.title);

    const { data: fallbackRows, error: fallbackError } = await fallbackQuery.limit(1);
    if (fallbackError) throw fallbackError;

    const found = (fallbackRows || [])[0];
    if (!found?.id) throw insertError;

    const nextServices = currentServices.some((row) => String(row.id) === String(found.id))
      ? currentServices
      : [...currentServices, found];

    return { service: found, allServices: nextServices, created: false };
  };

  const saveSelectedCategories = async () => {
    if (!storeId || !checkedCategoryIds.length || savingCategories) return;

    const selectedCategories = checkedCategoryIds
      .map((id) => categories.find((row) => String(row.id) === String(id)))
      .filter(Boolean);
    if (!selectedCategories.length) {
      setError("Select at least one valid category.");
      return;
    }

    try {
      setSavingCategories(true);
      setError("");
      setSuccess("");

      let snapshot = [...storeServices];
      let createdCount = 0;
      let nextActiveServiceId = activeServiceId;

      for (const category of selectedCategories) {
        const existed = Boolean(findServiceForCategory(snapshot, category)?.id);
        const result = await ensureCategoryService(category, snapshot);
        snapshot = result.allServices;

        if (!existed) createdCount += 1;

        if (!nextActiveServiceId && result.service?.id) {
          nextActiveServiceId = String(result.service.id);
        }
      }

      setStoreServices(snapshot);
      if (nextActiveServiceId) setActiveServiceId(nextActiveServiceId);
      setShowCategoryConfigurator(false);
      resetItemForm(nextActiveServiceId);

      if (createdCount > 0) {
        setSuccess(`${createdCount} ${createdCount > 1 ? "categories" : "category"} saved.`);
      } else {
        setSuccess("Categories updated.");
      }
    } catch (e) {
      setError(e?.message || "Failed to save selected categories.");
    } finally {
      setSavingCategories(false);
    }
  };

  const selectSavedCategory = (serviceId) => {
    if (String(activeServiceId) === String(serviceId)) {
      setActiveServiceId("");
      resetItemForm();
      return;
    }

    setActiveServiceId(String(serviceId));
    resetItemForm(String(serviceId));
  };

  const validateItem = () => {
    if (!activeServiceId) return "Choose a category and click Manage Items first.";
    if (!String(form.title || "").trim()) return "Item title is required.";

    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return "Enter a valid price.";

    const duration = asNum(form.duration_minutes);
    if (duration !== null && duration <= 0) return "Duration should be greater than 0 minutes.";

    if (!["MEN", "WOMEN"].includes(String(form.service_for || ""))) {
      return "Select Men or Women.";
    }

    return "";
  };

  const saveItem = async () => {
    if (!storeId || savingItem) return;

    const validationError = validateItem();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSavingItem(true);
      setError("");
      setSuccess("");

      const payload = {
        store_id: storeId,
        service_id: activeServiceId,
        title: String(form.title || "").trim(),
        description: asText(form.description),
        price: Number(form.price),
        currency_code: "MUR",
        duration_minutes: asNum(form.duration_minutes),
        service_for: String(form.service_for || "").trim().toUpperCase(),
        is_active: form.is_active !== false,
        sort_order: asNum(form.sort_order, getNextItemSortOrder(activeServiceId)),
      };

      if (editingItemId) {
        const { error: updateError } = await supabaseBrowser
          .from("store_service_items")
          .update(payload)
          .eq("id", editingItemId)
          .eq("store_id", storeId);
        if (updateError) throw updateError;
        setSuccess("Item updated.");
      } else {
        const { error: insertError } = await supabaseBrowser.from("store_service_items").insert(payload);
        if (insertError) throw insertError;
        setSuccess("Item added.");
      }

      resetItemForm(activeServiceId);

      const { data, error: reloadError } = await supabaseBrowser
        .from("store_service_items")
        .select(
          "id,store_id,service_id,title,description,price,currency_code,duration_minutes,service_for,is_active,sort_order,created_at,updated_at"
        )
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (reloadError) throw reloadError;
      setServiceItems(data || []);
    } catch (e) {
      setError(e?.message || "Failed to save item.");
    } finally {
      setSavingItem(false);
    }
  };

  const startEditItem = (item) => {
    if (String(activeServiceId) !== String(item.service_id || "")) {
      setActiveServiceId(String(item.service_id || ""));
    }

    setEditingItemId(String(item.id));
    setForm({
      title: item.title || "",
      duration_minutes:
        item.duration_minutes === null || item.duration_minutes === undefined ? "" : String(item.duration_minutes),
      description: item.description || "",
      price: item.price === null || item.price === undefined ? "" : String(item.price),
      service_for: item.service_for || "MEN",
      is_active: item.is_active !== false,
      sort_order: item.sort_order === null || item.sort_order === undefined ? "1" : String(item.sort_order),
    });
  };

  const removeItem = async (item) => {
    const ok = window.confirm(`Delete item \"${item?.title || "Untitled"}\"?`);
    if (!ok) return;

    try {
      setBusyItemId(String(item.id));
      setError("");
      setSuccess("");

      const { error: deleteError } = await supabaseBrowser
        .from("store_service_items")
        .delete()
        .eq("id", item.id)
        .eq("store_id", storeId);
      if (deleteError) throw deleteError;

      setServiceItems((prev) => prev.filter((row) => String(row.id) !== String(item.id)));
      if (String(editingItemId) === String(item.id)) resetItemForm(activeServiceId);
      setSuccess("Item deleted.");
    } catch (e) {
      setError(e?.message || "Failed to delete item.");
    } finally {
      setBusyItemId("");
    }
  };

  const toggleItemStatus = async (item) => {
    try {
      setBusyItemId(String(item.id));
      setError("");
      setSuccess("");

      const { error: updateError } = await supabaseBrowser
        .from("store_service_items")
        .update({ is_active: item.is_active === false })
        .eq("id", item.id)
        .eq("store_id", storeId);
      if (updateError) throw updateError;

      setServiceItems((prev) =>
        prev.map((row) =>
          String(row.id) === String(item.id) ? { ...row, is_active: row.is_active === false } : row
        )
      );
      setSuccess("Item status updated.");
    } catch (e) {
      setError(e?.message || "Failed to update item status.");
    } finally {
      setBusyItemId("");
    }
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold text-gray-900">Services</div>
          <div className="mt-1 text-xs text-gray-500">
            Configure categories once, then manage items inline under each saved category.
          </div>
        </div>

        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="space-y-4 p-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Category Configuration</div>
              <div className="mt-1 text-xs text-gray-500">
                {serviceCategoryRows.length} saved categories, {categories.length} available templates
              </div>
            </div>

            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => setShowCategoryConfigurator((prev) => !prev)}
            >
              <Settings2 className="h-4 w-4" />
              {showCategoryConfigurator ? "Hide Config" : "Configure Categories"}
            </button>
          </div>

          {showCategoryConfigurator ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={allCategoriesChecked}
                    onChange={(e) => toggleAllCategories(e.target.checked)}
                    disabled={!categories.length || loading}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Select all
                  <span className="text-xs text-gray-500">({checkedCategoryIds.length} selected)</span>
                </label>

                <div className="flex items-center gap-2">
                  {serviceCategoryRows.length ? (
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      onClick={() => setShowCategoryConfigurator(false)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
                    style={{
                      background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
                    }}
                    onClick={saveSelectedCategories}
                    disabled={!checkedCategoryIds.length || savingCategories}
                  >
                    {savingCategories ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Categories
                  </button>
                </div>
              </div>

              {categories.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {categories.map((category) => {
                    const categoryId = String(category.id);
                    const checked = checkedCategoryIds.includes(categoryId);
                    const thumbnail = category.image_url || null;
                    return (
                      <label
                        key={category.id}
                        className={[
                          "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                          checked ? "border-[#771FA8] bg-[rgba(119,31,168,0.05)]" : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategoryChecked(categoryId)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        />
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                          {thumbnail ? (
                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${thumbnail})` }} />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">{category.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                            {category.subtitle || category.description || "No description"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  No active categories found in service categories master.
                </div>
              )}
            </div>
          ) : serviceCategoryRows.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {serviceCategoryRows.slice(0, 6).map((row) => (
                <span
                  key={row.service.id}
                  className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                >
                  {row.label}
                </span>
              ))}
              {serviceCategoryRows.length > 6 ? (
                <span className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500">
                  +{serviceCategoryRows.length - 6} more
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
              No categories saved yet. Click <span className="font-semibold">Configure Categories</span>.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Saved Categories</div>
              <div className="mt-1 text-xs text-gray-500">Manage services inline under each category.</div>
            </div>
            <div className="text-xs text-gray-500">{serviceCategoryRows.length} categories</div>
          </div>

          {serviceCategoryRows.length ? (
            <div className="space-y-3">
              {serviceCategoryRows.map((row) => {
                const isActive = String(row.service.id) === String(activeServiceId);
                const thumb = row.category?.image_url || null;
                const listBusy = busyItemId !== "";

                return (
                  <div
                    key={row.service.id}
                    className={[
                      "overflow-hidden rounded-2xl border",
                      isActive ? "border-[#771FA8]" : "border-gray-200",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-3 bg-white p-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                          {thumb ? <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${thumb})` }} /> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">{row.label}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-gray-500">{row.subtitle}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600">
                          {row.count} {row.count === 1 ? "item" : "items"}
                        </span>
                        <Badge value={row.service?.is_active} />
                        <button
                          type="button"
                          onClick={() => selectSavedCategory(row.service.id)}
                          className={[
                            "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold",
                            isActive
                              ? "border-[#771FA8] bg-[rgba(119,31,168,0.08)] text-[#5B1685]"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                          ].join(" ")}
                        >
                          {isActive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {isActive ? "Close" : "Manage Items"}
                        </button>
                      </div>
                    </div>

                    {isActive ? (
                      <div className="border-t border-gray-200 bg-gray-50 p-4">
                        <div className="mb-4">
                          <div className="text-sm font-semibold text-gray-900">
                            {editingItemId ? `Edit Service Item in ${row.label}` : `Add Service Item in ${row.label}`}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">{row.subtitle}</div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Field label="Item Title *">
                            <input
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.title}
                              onChange={(e) => setField("title", e.target.value)}
                              placeholder="Classic Haircut"
                            />
                          </Field>

                          <Field label="Price *">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.price}
                              onChange={(e) => setField("price", e.target.value)}
                              placeholder="250"
                            />
                          </Field>

                          <Field label="Approx Duration (mins)">
                            <input
                              type="number"
                              min="1"
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.duration_minutes}
                              onChange={(e) => setField("duration_minutes", e.target.value)}
                              placeholder="30"
                            />
                          </Field>

                          <Field label="Gender *">
                            <select
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.service_for}
                              onChange={(e) => setField("service_for", e.target.value)}
                            >
                              <option value="MEN">Men</option>
                              <option value="WOMEN">Women</option>
                            </select>
                          </Field>

                            <Field label="Sort Order">
                              <input
                                type="number"
                                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                                value={form.sort_order}
                                onChange={(e) => setField("sort_order", e.target.value)}
                                placeholder="1"
                              />
                            </Field>

                          <Field label="Status">
                            <select
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.is_active ? "ACTIVE" : "INACTIVE"}
                              onChange={(e) => setField("is_active", e.target.value === "ACTIVE")}
                            >
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </Field>
                        </div>

                        <div className="mt-4">
                          <Field label="Description">
                            <textarea
                              className="min-h-[96px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                              value={form.description}
                              onChange={(e) => setField("description", e.target.value)}
                              placeholder="Short description of the service item."
                            />
                          </Field>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                          {editingItemId ? (
                            <button
                              type="button"
                              className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-100"
                              onClick={resetItemForm}
                            >
                              Cancel Edit
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-60"
                            style={{
                              background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
                            }}
                            disabled={savingItem}
                            onClick={saveItem}
                          >
                            {savingItem ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : editingItemId ? (
                              <Save className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                            {editingItemId ? "Save Item" : "Add Item"}
                          </button>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                          <table className="w-full min-w-[860px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Title</th>
                                <th className="px-4 py-3 font-semibold">Price</th>
                                <th className="px-4 py-3 font-semibold">Duration</th>
                                <th className="px-4 py-3 font-semibold">Gender</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Sort</th>
                                <th className="px-4 py-3 text-right font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeItems.length ? (
                                activeItems.map((item) => {
                                  const itemBusy = busyItemId === String(item.id);
                                  return (
                                    <tr key={item.id} className="border-t border-gray-100 align-top">
                                      <td className="px-4 py-3">
                                        <div className="font-semibold text-gray-900">{item.title || "Untitled"}</div>
                                        <div className="mt-1 text-xs text-gray-500">{item.description || "No description"}</div>
                                      </td>
                                      <td className="px-4 py-3 text-gray-700">MUR {Number(item.price || 0).toLocaleString()}</td>
                                      <td className="px-4 py-3 text-gray-700">{item.duration_minutes ?? "-"}</td>
                                      <td className="px-4 py-3 text-gray-700">{item.service_for || "-"}</td>
                                      <td className="px-4 py-3">
                                        <Badge value={item.is_active} />
                                      </td>
                                      <td className="px-4 py-3 text-gray-700">{item.sort_order ?? 1}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                            onClick={() => startEditItem(item)}
                                            disabled={itemBusy || listBusy}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                            onClick={() => toggleItemStatus(item)}
                                            disabled={itemBusy || listBusy}
                                          >
                                            {itemBusy ? "Working..." : item.is_active !== false ? "Deactivate" : "Activate"}
                                          </button>
                                          <button
                                            type="button"
                                            className="inline-flex h-8 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100"
                                            onClick={() => removeItem(item)}
                                            disabled={itemBusy || listBusy}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                                    No items added in this category yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              No categories saved yet. Configure and save categories to start adding items.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
