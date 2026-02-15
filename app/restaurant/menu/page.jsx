"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  BadgeCheck,
  Leaf,
  Eye,
  EyeOff,
  Save,
  X,
  Upload,
  CircleDot,
  QrCode,
  Copy,
  Download,
  ExternalLink,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const BUCKET_NAME = "restaurants";
const BUCKET_ROOT_FOLDER = "menu";

const EMPTY_MENU = () => ({
  version: 1,
  updated_at: new Date().toISOString(),
  full_menu_image_url: null,
  sections: [],
});

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

function safeMenu(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_MENU();

  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    version: 1,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    full_menu_image_url:
      typeof raw.full_menu_image_url === "string" && raw.full_menu_image_url
        ? raw.full_menu_image_url
        : null,
    sections: sections
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        id: typeof s.id === "string" ? s.id : uid(),
        name: typeof s.name === "string" ? s.name : "Section",
        description: typeof s.description === "string" ? s.description : null,
        items: (Array.isArray(s.items) ? s.items : [])
          .filter((i) => i && typeof i === "object")
          .map((i) => ({
            id: typeof i.id === "string" ? i.id : uid(),
            name: typeof i.name === "string" ? i.name : "Item",
            description: typeof i.description === "string" ? i.description : null,
            price: typeof i.price === "number" ? i.price : Number(i.price) || 0,
            image_urls: Array.isArray(i.image_urls) ? i.image_urls.filter(Boolean) : i.image_url ? [i.image_url] : [],
            is_veg: typeof i.is_veg === "boolean" ? i.is_veg : false,
            is_bestseller: typeof i.is_bestseller === "boolean" ? i.is_bestseller : false,
            is_available: typeof i.is_available === "boolean" ? i.is_available : true,
          })),
      })),
  };
}

function Dialog({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="font-semibold text-gray-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}

function extFromName(name) {
  const parts = String(name || "").split(".");
  const e = parts.length > 1 ? parts.pop() : "jpg";
  return String(e || "jpg").toLowerCase().slice(0, 10);
}

export default function RestaurantMenuPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [menu, setMenu] = useState(EMPTY_MENU());
  const [selectedSectionId, setSelectedSectionId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [menuUrl, setMenuUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);

  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemPrice, setItemPrice] = useState("199");
  const [itemVeg, setItemVeg] = useState(false);
  const [itemBest, setItemBest] = useState(false);
  const [itemAvail, setItemAvail] = useState(true);

  const [itemImages, setItemImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingFullMenu, setUploadingFullMenu] = useState(false);

  const editItemIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const fullMenuFileInputRef = useRef(null);
  const originalMenuRef = useRef(EMPTY_MENU());

  const sections = menu.sections || [];

  const selectedSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return sections.find((s) => s.id === selectedSectionId) || null;
  }, [sections, selectedSectionId]);

  const qrSrc = useMemo(() => {
    if (!menuUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=340x340&data=${encodeURIComponent(menuUrl)}`;
  }, [menuUrl]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSaveError("");
      setInfoMsg("");

      const {
        data: { user },
        error: userErr,
      } = await supabaseBrowser.auth.getUser();

      if (userErr) {
        setSaveError(userErr.message);
        setLoading(false);
        return;
      }
      if (!user) {
        setSaveError("Not logged in.");
        setLoading(false);
        return;
      }

      const { data: userRow, error: roleErr } = await supabaseBrowser
        .from("users")
        .select("id, role")
        .eq("id", user.id)
        .single();

      if (roleErr) {
        setSaveError(roleErr.message);
        setLoading(false);
        return;
      }
      if (!userRow || userRow.role !== "restaurantpartner") {
        setSaveError("Not a restaurant partner account.");
        setLoading(false);
        return;
      }

      const { data: restaurant, error } = await supabaseBrowser
        .from("restaurants")
        .select("id, menu")
        .eq("owner_user_id", user.id)
        .single();

      if (error) {
        setSaveError(error.message);
        setLoading(false);
        return;
      }
      if (!restaurant?.id) {
        setSaveError("Restaurant not found for this partner.");
        setLoading(false);
        return;
      }

      setRestaurantId(restaurant.id);

      const parsed = safeMenu(restaurant.menu);
      originalMenuRef.current = parsed;
      setMenu(parsed);
      setSelectedSectionId(parsed.sections?.[0]?.id || null);

      if (typeof window !== "undefined") {
        setMenuUrl(`${window.location.origin}/restaurant/public-menu?id=${restaurant.id}`);
      }

      if (!restaurant.menu || Array.isArray(restaurant.menu)) {
        await saveMenu(parsed, restaurant.id);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = useMemo(() => {
    try {
      return JSON.stringify(menu) !== JSON.stringify(originalMenuRef.current);
    } catch {
      return true;
    }
  }, [menu]);

  const saveMenu = async (nextMenu, forceRestaurantId) => {
    const rid = forceRestaurantId || restaurantId;
    if (!rid) {
      setSaveError("Restaurant ID missing.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setInfoMsg("");

    const payload = { ...safeMenu(nextMenu), updated_at: new Date().toISOString() };

    const { data, error } = await supabaseBrowser
      .from("restaurants")
      .update({ menu: payload })
      .eq("id", rid)
      .select("id, menu")
      .single();

    setSaving(false);

    if (error) {
      setSaveError(error.message || "Failed to save menu.");
      return;
    }
    if (!data?.id) {
      setSaveError("Update returned no row (RLS may be blocking update).");
      return;
    }

    const fresh = safeMenu(data.menu);
    originalMenuRef.current = fresh;
    setMenu(fresh);
    setInfoMsg("Menu saved.");
  };

  const uploadFullMenuImageFile = async (file) => {
    if (!restaurantId || !file) return null;

    setUploadingFullMenu(true);

    const ext = extFromName(file.name);
    const path = `${BUCKET_ROOT_FOLDER}/${restaurantId}/full-menu/${uid()}.${ext}`;

    const { error } = await supabaseBrowser.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    setUploadingFullMenu(false);

    if (error) {
      setSaveError(error.message || "Failed to upload full menu image.");
      return null;
    }

    const { data } = supabaseBrowser.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data?.publicUrl ? String(data.publicUrl) : null;
  };

  const onPickFullMenuImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFullMenuImageFile(file);
    if (!url) {
      setSaveError("Failed to get URL for uploaded image.");
      return;
    }

    const nextMenu = {
      ...menu,
      full_menu_image_url: url,
      updated_at: new Date().toISOString(),
    };

    setMenu(nextMenu);
    await saveMenu(nextMenu);

    if (fullMenuFileInputRef.current) fullMenuFileInputRef.current.value = "";
  };

  const removeFullMenuImage = async () => {
    const nextMenu = {
      ...menu,
      full_menu_image_url: null,
      updated_at: new Date().toISOString(),
    };
    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const openNewSection = () => {
    setEditingSectionId(null);
    setSectionName("");
    setSectionDesc("");
    setSectionModalOpen(true);
  };

  const openEditSection = (s) => {
    setEditingSectionId(s.id);
    setSectionName(s.name || "");
    setSectionDesc(s.description || "");
    setSectionModalOpen(true);
  };

  const upsertSection = async () => {
    const name = sectionName.trim();
    const description = sectionDesc.trim();
    if (!name) return;

    const nextMenu = (() => {
      const next = { ...menu, sections: [...(menu.sections || [])] };
      if (editingSectionId) {
        next.sections = next.sections.map((s) =>
          s.id === editingSectionId ? { ...s, name, description: description || null } : s
        );
      } else {
        const newSection = { id: uid(), name, description: description || null, items: [] };
        next.sections = [newSection, ...next.sections];
        setSelectedSectionId(newSection.id);
      }
      return { ...next, updated_at: new Date().toISOString() };
    })();

    setMenu(nextMenu);
    await saveMenu(nextMenu);

    setSectionModalOpen(false);
    setEditingSectionId(null);
    setSectionName("");
    setSectionDesc("");
  };

  const deleteSection = async (sectionId) => {
    const nextSections = (menu.sections || []).filter((s) => s.id !== sectionId);
    const nextMenu = { ...menu, sections: nextSections, updated_at: new Date().toISOString() };

    setMenu(nextMenu);
    if (selectedSectionId === sectionId) setSelectedSectionId(nextSections[0]?.id || null);

    await saveMenu(nextMenu);
  };

  const moveSection = async (sectionId, dir) => {
    const copy = [...(menu.sections || [])];
    const idx = copy.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;

    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= copy.length) return;

    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    const nextMenu = { ...menu, sections: copy, updated_at: new Date().toISOString() };

    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const uploadFilesToBucket = async (files) => {
    if (!restaurantId) return [];
    const itemId = editItemIdRef.current;
    if (!itemId) return [];

    const arr = Array.from(files || []);
    if (arr.length === 0) return [];

    setUploading(true);

    const uploadedUrls = [];
    for (const file of arr) {
      const ext = extFromName(file.name);
      const path = `${BUCKET_ROOT_FOLDER}/${restaurantId}/${itemId}/${uid()}.${ext}`;

      const { error: upErr } = await supabaseBrowser.storage
        .from(BUCKET_NAME)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (upErr) continue;

      const { data } = supabaseBrowser.storage.from(BUCKET_NAME).getPublicUrl(path);
      const url = data?.publicUrl ? String(data.publicUrl) : null;
      if (url) uploadedUrls.push(url);
    }

    setUploading(false);
    return uploadedUrls;
  };

  const onPickImages = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const urls = await uploadFilesToBucket(files);
    if (urls.length > 0) setItemImages((prev) => [...prev, ...urls]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (url) => setItemImages((prev) => prev.filter((u) => u !== url));

  const resetItemModal = () => {
    setEditingItemId(null);
    editItemIdRef.current = null;
    setItemName("");
    setItemDesc("");
    setItemPrice("199");
    setItemVeg(false);
    setItemBest(false);
    setItemAvail(true);
    setItemImages([]);
    setUploading(false);
  };

  const openNewItem = () => {
    if (!selectedSectionId) return;
    resetItemModal();
    editItemIdRef.current = uid();
    setItemModalOpen(true);
  };

  const openEditItem = (item) => {
    resetItemModal();
    setEditingItemId(item.id);
    editItemIdRef.current = item.id;

    setItemName(item.name || "");
    setItemDesc(item.description || "");
    setItemPrice(String(item.price ?? 0));
    setItemVeg(!!item.is_veg);
    setItemBest(!!item.is_bestseller);
    setItemAvail(item.is_available !== false);
    setItemImages(Array.isArray(item.image_urls) ? item.image_urls : []);
    setItemModalOpen(true);
  };

  const upsertItem = async () => {
    if (!selectedSectionId) return;

    const name = itemName.trim();
    const description = itemDesc.trim();
    const priceNum = Number(itemPrice);
    const idToUse = editItemIdRef.current || editingItemId || uid();

    if (!name) return;
    if (!Number.isFinite(priceNum) || priceNum < 0) return;

    const nextMenu = (() => {
      const nextSections = (menu.sections || []).map((s) => {
        if (s.id !== selectedSectionId) return s;

        const items = [...(s.items || [])];
        const payload = {
          id: idToUse,
          name,
          description: description || null,
          price: priceNum,
          image_urls: itemImages || [],
          is_veg: itemVeg,
          is_bestseller: itemBest,
          is_available: itemAvail,
        };

        const idx = items.findIndex((i) => i.id === idToUse);
        if (idx >= 0) items[idx] = { ...items[idx], ...payload };
        else items.unshift(payload);

        return { ...s, items };
      });

      return { ...menu, sections: nextSections, updated_at: new Date().toISOString() };
    })();

    setMenu(nextMenu);
    await saveMenu(nextMenu);

    setItemModalOpen(false);
    resetItemModal();
  };

  const deleteItem = async (sectionId, itemId) => {
    const nextSections = (menu.sections || []).map((s) =>
      s.id === sectionId ? { ...s, items: (s.items || []).filter((i) => i.id !== itemId) } : s
    );

    const nextMenu = { ...menu, sections: nextSections, updated_at: new Date().toISOString() };
    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const toggleAvailability = async (sectionId, itemId) => {
    const nextSections = (menu.sections || []).map((s) => {
      if (s.id !== sectionId) return s;
      const items = (s.items || []).map((i) =>
        i.id === itemId ? { ...i, is_available: !i.is_available } : i
      );
      return { ...s, items };
    });

    const nextMenu = { ...menu, sections: nextSections, updated_at: new Date().toISOString() };
    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const downloadQr = () => {
    if (!qrSrc) return;
    const a = document.createElement("a");
    a.href = qrSrc;
    a.download = `menu-qr-${restaurantId || "restaurant"}.png`;
    a.target = "_blank";
    a.click();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="mt-3 h-4 w-72 bg-gray-200 rounded" />
          <div className="mt-8 grid grid-cols-12 gap-4">
            <div className="col-span-4 h-80 bg-gray-200 rounded-2xl" />
            <div className="col-span-8 h-80 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">Menu</div>
              <div className="text-sm text-gray-500">Manage menu sections, item details, and item images.</div>
              {saveError ? <div className="mt-2 text-sm text-red-600">Save error: {saveError}</div> : null}
              {infoMsg ? <div className="mt-2 text-sm text-emerald-600">{infoMsg}</div> : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openNewSection}
                className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 text-sm font-semibold flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add section
              </button>

              <button
                type="button"
                disabled={!hasChanges || saving}
                onClick={() => saveMenu(menu)}
                className="h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 text-sm font-semibold flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <QrCode className="h-4 w-4" />
            Menu QR
          </div>

          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-600">Public menu URL</label>
            <input
              value={menuUrl}
              onChange={(e) => setMenuUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-300"
              placeholder="https://your-domain.com/restaurant/public-menu?id={restaurantId}"
            />
          </div>

          {qrSrc ? (
            <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50">
              <img src={qrSrc} alt="Menu QR" className="w-full rounded-lg bg-white p-2" />
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={downloadQr}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={() => window.open(menuUrl, "_blank")}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          </div>
        </div>
      </div>

      {/* SEPARATE SECTION: FULL MENU CARD IMAGE */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Full Menu Card Image</div>
        <div className="text-xs text-gray-500 mt-1">
          Upload one image containing your complete dishes/menu card (separate from section items).
        </div>

        <input
          ref={fullMenuFileInputRef}
          type="file"
          accept="image/*"
          onChange={onPickFullMenuImage}
          className="hidden"
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fullMenuFileInputRef.current?.click()}
            disabled={uploadingFullMenu}
            className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 px-3 text-sm font-semibold inline-flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {uploadingFullMenu ? "Uploading..." : menu.full_menu_image_url ? "Replace Image" : "Upload Image"}
          </button>

          {menu.full_menu_image_url ? (
            <button
              type="button"
              onClick={removeFullMenuImage}
              className="h-10 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-3 text-sm font-semibold inline-flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          ) : null}
        </div>

        {menu.full_menu_image_url ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2">
            <img
              src={menu.full_menu_image_url}
              alt="Full menu card"
              className="w-full max-h-[420px] object-contain rounded-lg bg-white"
            />
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500">No full menu card image uploaded yet.</div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Sections</div>
              <button
                type="button"
                onClick={openNewSection}
                className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 text-sm font-semibold flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            {sections.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">Create your first section.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sections.map((s, idx) => {
                  const active = s.id === selectedSectionId;
                  return (
                    <div key={s.id} className={`px-4 py-3 hover:bg-gray-50 ${active ? "bg-blue-50" : "bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedSectionId(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setSelectedSectionId(s.id);
                          }}
                          className="flex-1 cursor-pointer select-none"
                        >
                          <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                          <div className="text-xs text-gray-500">
                            {(s.items || []).length} items {s.description ? `• ${s.description}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveSection(s.id, "up")}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                            disabled={idx === 0}
                          >
                            <ChevronUp className="h-4 w-4 text-gray-700" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(s.id, "down")}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                            disabled={idx === sections.length - 1}
                          >
                            <ChevronDown className="h-4 w-4 text-gray-700" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditSection(s)}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                          >
                            <Pencil className="h-4 w-4 text-gray-700" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSection(s.id)}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">{selectedSection ? selectedSection.name : "Items"}</div>
                <div className="text-xs text-gray-500">
                  {selectedSection ? selectedSection.description || "Manage items in this section" : "Select a section"}
                </div>
              </div>

              <button
                type="button"
                onClick={openNewItem}
                disabled={!selectedSectionId}
                className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 px-3 text-sm font-semibold flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add item
              </button>
            </div>

            {!selectedSection ? (
              <div className="px-4 py-12 text-center text-sm text-gray-500">Select a section to manage items.</div>
            ) : (selectedSection.items || []).length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-500">No items in this section yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {selectedSection.items.map((it) => {
                  const imgs = Array.isArray(it.image_urls) ? it.image_urls : [];
                  const first = imgs[0] || null;

                  return (
                    <div key={it.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                            {first ? <img src={first} alt={it.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}
                            {imgs.length > 1 ? (
                              <span className="absolute bottom-1 right-1 rounded-full bg-black/70 text-white text-[10px] px-1.5 py-0.5">+{imgs.length - 1}</span>
                            ) : null}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-gray-900">{it.name}</div>
                              {it.is_bestseller ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Bestseller
                                </span>
                              ) : null}
                              {it.is_veg ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                  <Leaf className="h-3.5 w-3.5" />
                                  Veg
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  <CircleDot className="h-3.5 w-3.5 fill-red-600 text-red-600" />
                                  Non-veg
                                </span>
                              )}
                              {it.is_available === false ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                                  <EyeOff className="h-3.5 w-3.5" />
                                  Hidden
                                </span>
                              ) : null}
                            </div>

                            <div className="text-xs text-gray-500 mt-0.5">{it.description || "—"}</div>
                            <div className="text-sm font-semibold text-gray-900 mt-1">{money(it.price)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleAvailability(selectedSection.id, it.id)}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                          >
                            {it.is_available === false ? <Eye className="h-4 w-4 text-gray-700" /> : <EyeOff className="h-4 w-4 text-gray-700" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditItem(it)}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                          >
                            <Pencil className="h-4 w-4 text-gray-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteItem(selectedSection.id, it.id)}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sections.length > 0 ? (
            <div className="mt-3 text-xs text-gray-500">
              Last updated:{" "}
              <span className="font-semibold text-gray-700">
                {menu.updated_at ? new Date(menu.updated_at).toLocaleString() : "—"}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        title={editingSectionId ? "Edit section" : "Add section"}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSectionModalOpen(false)}
              className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={upsertSection}
              className="h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 text-sm font-semibold"
            >
              {editingSectionId ? "Save" : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Section name</label>
            <input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="e.g. Starters, Main Course, Desserts"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Description</label>
            <textarea
              value={sectionDesc}
              onChange={(e) => setSectionDesc(e.target.value)}
              placeholder="Optional"
              rows={3}
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={itemModalOpen}
        onClose={() => {
          setItemModalOpen(false);
          resetItemModal();
        }}
        title={editingItemId ? "Edit item" : "Add item"}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setItemModalOpen(false);
                resetItemModal();
              }}
              className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={upsertItem}
              disabled={uploading || saving}
              className="h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 text-sm font-semibold"
            >
              {uploading || saving ? "Saving..." : editingItemId ? "Save" : "Add"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <label className="text-sm font-semibold text-gray-700">Item name</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Chicken Manchuria"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div className="col-span-12">
            <label className="text-sm font-semibold text-gray-700">Description</label>
            <textarea
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              placeholder="Ingredients, portion size, spice level..."
              rows={3}
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div className="col-span-12 sm:col-span-6">
            <label className="text-sm font-semibold text-gray-700">Price</label>
            <input
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              inputMode="numeric"
              placeholder="199"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
          </div>

          <div className="col-span-12 sm:col-span-6">
            <label className="text-sm font-semibold text-gray-700">Images</label>

            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!restaurantId || uploading}
                className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 px-3 text-sm font-semibold flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload images"}
              </button>
              <div className="text-xs text-gray-500">{itemImages.length} selected</div>
            </div>

            {itemImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {itemImages.map((u) => (
                  <div key={u} className="relative h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <img src={u} alt="Item" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(u)}
                      className="absolute top-1 right-1 h-7 w-7 rounded-lg bg-white/90 border border-gray-200 hover:bg-white flex items-center justify-center"
                    >
                      <X className="h-4 w-4 text-gray-700" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-500">No images uploaded</div>
            )}
          </div>

          <div className="col-span-12">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setItemVeg((v) => !v)}
                className={`h-10 rounded-xl border px-4 text-sm font-semibold flex items-center gap-2 ${
                  itemVeg ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                {itemVeg ? (
                  <>
                    <Leaf className="h-4 w-4" />
                    Veg
                  </>
                ) : (
                  <>
                    <CircleDot className="h-4 w-4 fill-red-600 text-red-600" />
                    Non-veg
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setItemBest((v) => !v)}
                className={`h-10 rounded-xl border px-4 text-sm font-semibold flex items-center gap-2 ${
                  itemBest ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <BadgeCheck className="h-4 w-4" />
                Bestseller
              </button>

              <button
                type="button"
                onClick={() => setItemAvail((v) => !v)}
                className={`h-10 rounded-xl border px-4 text-sm font-semibold flex items-center gap-2 ${
                  itemAvail ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50" : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                {itemAvail ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {itemAvail ? "Visible" : "Hidden"}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
