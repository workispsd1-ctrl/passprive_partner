"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
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
  X,
  Upload,
  CircleDot,
  QrCode,
  Copy,
  Download,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchRestaurantPlan, hasMenuCatalogue } from "@/lib/restaurant-partner/plan";
import {
  fetchOwnedRestaurantOffersData,
  replaceRestaurantMediaUrls,
  saveRestaurantMenuData,
} from "@/lib/restaurantData";
import ApplyToBranchesButton from "@/components/restaurant-dashboard/ApplyToBranchesButton";
import { MENU_KINDS, menuAreas, sectionPlace } from "@/lib/menuAreas";
import ModifierGroupsEditor, {
  VariantsEditor,
  cleanModifierGroups,
  cleanVariants,
  modifierGroupsError,
  toEditableGroups,
  toEditableVariants,
  variantsError,
} from "@/components/restaurant-dashboard/ModifierGroupsEditor";

const BUCKET_NAME = "restaurants";
const BUCKET_ROOT_FOLDER = "menu";

const EMPTY_MENU = () => ({
  version: 1,
  updated_at: new Date().toISOString(),
  full_menu_image_url: null,
  full_menu_image_urls: [],
  sections: [],
});

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "MUR",
    maximumFractionDigits: 0,
  }).format(num);
}

function normalizePriceInput(v) {
  return String(v || "").replace(/\D/g, "");
}

function extFromName(name) {
  const parts = String(name || "").split(".");
  const e = parts.length > 1 ? parts.pop() : "jpg";
  return String(e || "jpg").toLowerCase().slice(0, 10);
}

function parseMenuRaw(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function getMenuImageUrls(menuObj) {
  if (!menuObj || typeof menuObj !== "object") return [];

  const candidates = [
    menuObj.full_menu_image_urls,
    menuObj.full_menu_image_url,
    menuObj.menu_images,
    menuObj.images,
    menuObj.gallery,
    menuObj.fullMenuImages,
    menuObj.full_menu_cards,
  ];

  const out = [];
  for (const c of candidates) {
    if (Array.isArray(c)) out.push(...c);
    else if (typeof c === "string") out.push(c);
  }

  return Array.from(new Set(out.map((v) => String(v || "").trim()).filter(Boolean)));
}

function safeMenu(rawInput) {
  const raw = parseMenuRaw(rawInput);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_MENU();

  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const menuImages = getMenuImageUrls(raw);

  return {
    ...raw,
    version: 1,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    full_menu_image_url: menuImages[0] || null,
    full_menu_image_urls: menuImages,
    sections: sections
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        ...s,
        id: typeof s.id === "string" ? s.id : uid(),
        name: typeof s.name === "string" ? s.name : "Section",
        description: typeof s.description === "string" ? s.description : null,
        items: (Array.isArray(s.items) ? s.items : [])
          .filter((i) => i && typeof i === "object")
          .map((i) => ({
            ...i,
            id: typeof i.id === "string" ? i.id : uid(),
            name: typeof i.name === "string" ? i.name : "Item",
            description: typeof i.description === "string" ? i.description : null,
            price: typeof i.price === "number" ? i.price : Number(i.price) || 0,
            image_urls: Array.isArray(i.image_urls)
              ? i.image_urls.filter(Boolean)
              : i.image_url
              ? [i.image_url]
              : [],
            is_veg: typeof i.is_veg === "boolean" ? i.is_veg : false,
            is_bestseller: typeof i.is_bestseller === "boolean" ? i.is_bestseller : false,
            is_available: typeof i.is_available === "boolean" ? i.is_available : true,
          })),
      })),
  };
}

function itemBuckets(section, subId) {
  const items = section?.items || [];
  const subcats = Array.isArray(section?.subcategories) ? section.subcategories : [];
  if (subId) {
    const c = subcats.find((x) => x.id === subId);
    return c ? [{ id: c.id, name: null, items: items.filter((i) => i.subcategory_id === c.id) }] : [];
  }
  const known = new Set(subcats.map((c) => c.id));
  return [
    { id: "", name: null, items: items.filter((i) => !known.has(i.subcategory_id)) },
    ...subcats.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.subcategory_id === c.id) })),
  ];
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

function AreaModal({ initial, canDelete, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || "");
  const [menus, setMenus] = useState(initial?.menus || ["Kitchen", "Bar"]);
  const toggle = (k) => setMenus((m) => (m.includes(k) ? m.filter((x) => x !== k) : MENU_KINDS.filter((x) => m.includes(x) || x === k)));
  const ready = name.trim() && menus.length;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold text-gray-900">{initial?.id ? "Edit area" : "Add area"}</div>
        <label className="mt-4 block text-sm font-semibold text-gray-700">Area name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Interior, PUB, Pool"
          className="mt-2 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-300"
        />
        <div className="mt-4 text-sm font-semibold text-gray-700">Menus in this area</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MENU_KINDS.map((k) => {
            const on = menus.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={`h-11 rounded-xl border text-sm font-semibold ${on ? "border-[#FF4800] bg-[#FF4800] text-white" : "border-gray-200 bg-white text-gray-700"}`}
              >
                {on ? "✓ " : ""}
                {k} menu
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-2">
          {initial?.id ? (
            <button
              type="button"
              disabled={!canDelete}
              title={canDelete ? "" : "Move or delete this area's sections first"}
              onClick={onDelete}
              className="h-10 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-600 disabled:opacity-40"
            >
              Delete area
            </button>
          ) : null}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSave({ id: initial?.id || uid(), name: name.trim(), menus })}
            className="h-10 rounded-xl bg-[#FF4800] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentPresetsEditor({ value, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!text) return;
    if (!value.some((v) => v.toLowerCase() === text.toLowerCase())) onChange([...value, text].slice(0, 30));
    setDraft("");
  };
  return (
    <div className="mt-2">
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-gray-700">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={60}
          placeholder="Type a comment and press Enter"
          className="h-10 flex-1 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-300"
        />
        <button type="button" onClick={add} className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50">
          Add
        </button>
      </div>
    </div>
  );
}

export default function RestaurantMenuPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [menu, setMenu] = useState(EMPTY_MENU());
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [subDialog, setSubDialog] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [menuUrl, setMenuUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [tableLayouts, setTableLayouts] = useState([]);
  const [selectedQrTable, setSelectedQrTable] = useState("");


  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");
  const [sectionGroup, setSectionGroup] = useState("");
  const [sectionComments, setSectionComments] = useState([]);
  const [sectionArea, setSectionArea] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);

  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemPrice, setItemPrice] = useState("199");
  const [itemVeg, setItemVeg] = useState(false);
  const [itemBest, setItemBest] = useState(false);
  const [itemAvail, setItemAvail] = useState(true);
  const [itemGroups, setItemGroups] = useState([]);
  const [itemVariants, setItemVariants] = useState([]);
  const [itemSubcat, setItemSubcat] = useState("");
  const [itemError, setItemError] = useState("");

  const [itemImages, setItemImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingFullMenu, setUploadingFullMenu] = useState(false);

  const editItemIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const fullMenuFileInputRef = useRef(null);
  const originalMenuRef = useRef(EMPTY_MENU());

  const sections = menu.sections || [];
  const areas = useMemo(() => menuAreas(menu), [menu]);
  const [menuAreaId, setMenuAreaId] = useState("");
  const [menuTab, setMenuTab] = useState("Kitchen");
  const [areaModal, setAreaModal] = useState(null);
  const currentArea = areas.find((a) => a.id === menuAreaId) || areas[0];
  const currentKind = currentArea.menus.includes(menuTab) ? menuTab : currentArea.menus[0];
  const inTab = (s, areaId, kind) => {
    const p = sectionPlace(areas, s);
    return p.areaId === areaId && p.kind === kind;
  };
  const tabSections = useMemo(
    () => sections.filter((s) => inTab(s, currentArea.id, currentKind)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, areas, currentArea.id, currentKind]
  );
  const switchMenuTab = (areaId, kind) => {
    const area = areas.find((a) => a.id === areaId) || areas[0];
    const k = area.menus.includes(kind) ? kind : area.menus[0];
    setMenuAreaId(area.id);
    setMenuTab(k);
    const first = sections.find((s) => inTab(s, area.id, k));
    setSelectedSectionId(first?.id || null);
    setSelectedSubId("");
  };
  const saveArea = async (area) => {
    const list = areas.some((a) => a.id === area.id) ? areas.map((a) => (a.id === area.id ? area : a)) : [...areas, area];
    const nextMenu = { ...menu, menu_areas: list, updated_at: new Date().toISOString() };
    setMenu(nextMenu);
    setAreaModal(null);
    await saveMenu(nextMenu);
    switchMenuTab(area.id, area.menus.includes(currentKind) ? currentKind : area.menus[0]);
  };
  const deleteArea = async (area) => {
    const list = areas.filter((a) => a.id !== area.id);
    if (!list.length) return;
    const nextMenu = { ...menu, menu_areas: list, updated_at: new Date().toISOString() };
    setMenu(nextMenu);
    setAreaModal(null);
    await saveMenu(nextMenu);
    switchMenuTab(list[0].id, list[0].menus[0]);
  };
  const menuCardImages = useMemo(() => getMenuImageUrls(menu), [menu]);

  const selectedSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return sections.find((s) => s.id === selectedSectionId) || null;
  }, [sections, selectedSectionId]);
  const selectedSubName = (selectedSection?.subcategories || []).find((c) => c.id === selectedSubId)?.name || "";

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
      if (!userRow || !["restaurantpartner", "restaurant_admin"].includes(String(userRow.role || "").toLowerCase())) {
        setSaveError("Not a restaurant management account.");
        setLoading(false);
        return;
      }

      let restaurant = null;
      try {
        restaurant = await fetchOwnedRestaurantOffersData(supabaseBrowser, user.id);
      } catch (error) {
        setSaveError(error.message);
        setLoading(false);
        return;
      }
      if (!restaurant?.restaurantId) {
        setSaveError("Restaurant not found for this partner.");
        setLoading(false);
        return;
      }

      const { plan } = await fetchRestaurantPlan().catch(() => ({ plan: null }));
      const menuUnlocked = hasMenuCatalogue(plan);

      setRestaurantId(restaurant.restaurantId);
      setIsSubscribed(Boolean(menuUnlocked));

      const parsed = safeMenu(restaurant.menu);
      originalMenuRef.current = parsed;
      setMenu(parsed);
      {
        const startAreas = menuAreas(parsed);
        const start = sectionPlace(startAreas, { menu_area_id: startAreas[0].id, group: startAreas[0].menus[0] });
        setSelectedSectionId((parsed.sections || []).find((x) => {
          const p = sectionPlace(startAreas, x);
          return p.areaId === start.areaId && p.kind === start.kind;
        })?.id || null);
      }
      setSelectedSubId("");

      if (typeof window !== "undefined") {
        const catalogUrl = `${window.location.origin}/public-menu?id=${restaurant.restaurantId}`;
        setMenuUrl(menuUnlocked ? catalogUrl : getMenuImageUrls(parsed)[0] || "");
      }

      if (!restaurant.menu || Array.isArray(restaurant.menu)) {
        await saveMenu(parsed, restaurant.restaurantId);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId || typeof window === "undefined") return;
    const catalogUrl = `${window.location.origin}/public-menu?id=${restaurantId}`;
    setMenuUrl(isSubscribed ? catalogUrl : menuCardImages[0] || "");
  }, [restaurantId, isSubscribed, menuCardImages]);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseBrowser
        .from("restaurant_table_layouts")
        .select("id, table_no, label, qr_key")
        .eq("restaurant_id", restaurantId)
        .order("table_no", { ascending: true });
      if (cancelled) return;
      if (error) {
        setTableLayouts([]);
        setSelectedQrTable("");
        return;
      }
      const rows = data || [];
      setTableLayouts(rows);
      setSelectedQrTable((prev) => {
        if (prev && rows.some((r) => String(r.table_no) === String(prev))) return prev;
        return rows[0]?.table_no ? String(rows[0].table_no) : "";
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

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
    try {
      const savedUrls = await replaceRestaurantMediaUrls(
        supabaseBrowser,
        rid,
        "menu",
        getMenuImageUrls(payload)
      );
      const fresh = safeMenu({
        ...payload,
        full_menu_image_urls: savedUrls,
        full_menu_image_url: savedUrls[0] || null,
        sections: payload.sections || [],
      });
      await saveRestaurantMenuData(supabaseBrowser, rid, fresh);
      originalMenuRef.current = fresh;
      setMenu(fresh);
      setInfoMsg("Menu images saved.");
    } catch (error) {
      setSaveError(error.message || "Failed to save menu images.");
    } finally {
      setSaving(false);
    }

    return;
  };

  const uploadFullMenuImageFile = async (file) => {
    if (!restaurantId || !file) return null;

    const ext = extFromName(file.name);
    const path = `${BUCKET_ROOT_FOLDER}/${restaurantId}/full-menu/${uid()}.${ext}`;

    const { error } = await supabaseBrowser.storage.from(BUCKET_NAME).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (error) {
      setSaveError(error.message || "Failed to upload menu image.");
      return null;
    }

    const { data } = supabaseBrowser.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data?.publicUrl ? String(data.publicUrl) : null;
  };

  const onPickFullMenuImage = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFullMenu(true);
    const uploaded = [];

    for (const file of files) {
      const url = await uploadFullMenuImageFile(file);
      if (url) uploaded.push(url);
    }

    setUploadingFullMenu(false);

    if (uploaded.length === 0) {
      setSaveError("Failed to upload image(s).");
      return;
    }

    const merged = Array.from(new Set([...menuCardImages, ...uploaded]));
    const nextMenu = {
      ...menu,
      full_menu_image_urls: merged,
      full_menu_image_url: merged[0] || null,
      updated_at: new Date().toISOString(),
    };

    setMenu(nextMenu);
    await saveMenu(nextMenu);

    if (fullMenuFileInputRef.current) fullMenuFileInputRef.current.value = "";
  };

  const removeFullMenuImage = async (urlToRemove) => {
    const nextImages = menuCardImages.filter((u) => u !== urlToRemove);
    const nextMenu = {
      ...menu,
      full_menu_image_urls: nextImages,
      full_menu_image_url: nextImages[0] || null,
      updated_at: new Date().toISOString(),
    };
    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const openNewSection = () => {
    if (!isSubscribed) return;
    setEditingSectionId(null);
    setSectionName("");
    setSectionDesc("");
    setSectionGroup(currentKind);
    setSectionArea(currentArea.id);
    setSectionComments([]);
    setSectionModalOpen(true);
  };

  const openEditSection = (s) => {
    if (!isSubscribed) return;
    setEditingSectionId(s.id);
    setSectionName(s.name || "");
    setSectionDesc(s.description || "");
    setSectionGroup(sectionPlace(areas, s).kind);
    setSectionArea(sectionPlace(areas, s).areaId);
    setSectionComments(Array.isArray(s.comment_presets) ? s.comment_presets : []);
    setSectionModalOpen(true);
  };

  const upsertSection = async () => {
    if (!isSubscribed) return;

    const name = sectionName.trim();
    const description = sectionDesc.trim();
    const placeArea = areas.find((a) => a.id === sectionArea) || currentArea;
    const group = placeArea.menus.includes(sectionGroup) ? sectionGroup : placeArea.menus[0];
    const menu_area_id = placeArea.id;
    if (!name) return;

    const nextMenu = (() => {
      const next = { ...menu, sections: [...(menu.sections || [])] };
      if (editingSectionId) {
        next.sections = next.sections.map((s) =>
          s.id === editingSectionId ? { ...s, name, description: description || null, group, menu_area_id, comment_presets: sectionComments } : s
        );
      } else {
        const newSection = { id: uid(), name, description: description || null, group, menu_area_id, comment_presets: sectionComments, subcategories: [], items: [] };
        next.sections = [newSection, ...next.sections];
        setSelectedSectionId(newSection.id);
        setSelectedSubId("");
      }
      return { ...next, updated_at: new Date().toISOString() };
    })();

    setMenu(nextMenu);
    await saveMenu(nextMenu);
    setMenuAreaId(menu_area_id);
    setMenuTab(group);
    if (editingSectionId) setSelectedSectionId(editingSectionId);

    setSectionModalOpen(false);
    setEditingSectionId(null);
    setSectionName("");
    setSectionDesc("");
    setSectionGroup("");
  };

  const selectSection = (sectionId, subId = "") => {
    setSelectedSectionId(sectionId);
    setSelectedSubId(subId);
  };

  const saveSubcategory = async () => {
    if (!isSubscribed || !subDialog) return;
    const name = subDialog.name.trim().slice(0, 60);
    if (!name) return;
    const newId = subDialog.id || uid();
    const nextMenu = {
      ...menu,
      updated_at: new Date().toISOString(),
      sections: (menu.sections || []).map((s) => {
        if (s.id !== subDialog.sectionId) return s;
        const list = Array.isArray(s.subcategories) ? s.subcategories : [];
        return {
          ...s,
          subcategories: subDialog.id ? list.map((c) => (c.id === subDialog.id ? { ...c, name } : c)) : [...list, { id: newId, name }],
        };
      }),
    };
    setMenu(nextMenu);
    setSubDialog(null);
    selectSection(subDialog.sectionId, newId);
    await saveMenu(nextMenu);
  };

  const deleteSubcategory = async (section, sub) => {
    if (!isSubscribed) return;
    const count = (section.items || []).filter((i) => i.subcategory_id === sub.id).length;
    const msg = count
      ? `Delete "${sub.name}"? Its ${count} item${count === 1 ? "" : "s"} will stay in ${section.name}.`
      : `Delete "${sub.name}"?`;
    if (!window.confirm(msg)) return;
    const nextMenu = {
      ...menu,
      updated_at: new Date().toISOString(),
      sections: (menu.sections || []).map((s) =>
        s.id !== section.id
          ? s
          : {
              ...s,
              subcategories: (s.subcategories || []).filter((c) => c.id !== sub.id),
              items: (s.items || []).map((i) => (i.subcategory_id === sub.id ? { ...i, subcategory_id: null } : i)),
            }
      ),
    };
    setMenu(nextMenu);
    if (selectedSubId === sub.id) setSelectedSubId("");
    await saveMenu(nextMenu);
  };

  const deleteSection = async (sectionId) => {
    if (!isSubscribed) return;

    const nextSections = (menu.sections || []).filter((s) => s.id !== sectionId);
    const nextMenu = { ...menu, sections: nextSections, updated_at: new Date().toISOString() };

    setMenu(nextMenu);
    if (selectedSectionId === sectionId) selectSection(nextSections[0]?.id || null);

    await saveMenu(nextMenu);
  };

  const moveSection = async (sectionId, dir) => {
    if (!isSubscribed) return;

    const copy = [...(menu.sections || [])];
    const idx = copy.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;

    const here = sectionPlace(areas, copy[idx]);
    let target = idx;
    do target += dir === "up" ? -1 : 1;
    while (target >= 0 && target < copy.length && !inTab(copy[target], here.areaId, here.kind));
    if (target < 0 || target >= copy.length) return;

    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    const nextMenu = { ...menu, sections: copy, updated_at: new Date().toISOString() };

    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const uploadFilesToBucket = async (files) => {
    if (!restaurantId || !isSubscribed) return [];
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
    if (!isSubscribed) return;

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
    setItemGroups([]);
    setItemVariants([]);
    setItemSubcat("");
    setItemError("");
    setUploading(false);
  };

  const openNewItem = (subId = selectedSubId) => {
    if (!selectedSectionId || !isSubscribed) return;
    resetItemModal();
    editItemIdRef.current = uid();
    setItemSubcat(subId || "");
    setItemModalOpen(true);
  };

  const openEditItem = (item) => {
    if (!isSubscribed) return;
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
    setItemGroups(toEditableGroups(item.modifier_groups));
    setItemVariants(toEditableVariants(item.variants));
    setItemSubcat(item.subcategory_id || "");
    setItemModalOpen(true);
  };

  const upsertItem = async () => {
    if (!selectedSectionId || !isSubscribed) return;

    const name = itemName.trim();
    const description = itemDesc.trim();
    const priceNum = Number(itemPrice);
    const idToUse = editItemIdRef.current || editingItemId || uid();

    if (!name) return setItemError("Enter an item name.");
    const variantError = variantsError(itemVariants);
    if (variantError) return setItemError(variantError);
    const variants = cleanVariants(itemVariants);
    if (!variants.length && (!Number.isFinite(priceNum) || priceNum < 0)) return setItemError("Enter a valid price.");
    const groupsError = modifierGroupsError(itemGroups);
    if (groupsError) return setItemError(groupsError);
    const modifierGroups = cleanModifierGroups(itemGroups);
    const subcats = (selectedSection?.subcategories || []).map((c) => c.id);

    const nextMenu = (() => {
      const nextSections = (menu.sections || []).map((s) => {
        if (s.id !== selectedSectionId) return s;

        const items = [...(s.items || [])];
        const payload = {
          id: idToUse,
          name,
          description: description || null,
          price: variants.length ? Math.min(...variants.map((v) => v.price)) : priceNum,
          variants,
          image_urls: itemImages || [],
          is_veg: itemVeg,
          is_bestseller: itemBest,
          is_available: itemAvail,
          subcategory_id: subcats.includes(itemSubcat) ? itemSubcat : null,
          modifier_groups: modifierGroups,
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
    if (!isSubscribed) return;
    const nextSections = (menu.sections || []).map((s) =>
      s.id === sectionId ? { ...s, items: (s.items || []).filter((i) => i.id !== itemId) } : s
    );

    const nextMenu = { ...menu, sections: nextSections, updated_at: new Date().toISOString() };
    setMenu(nextMenu);
    await saveMenu(nextMenu);
  };

  const toggleAvailability = async (sectionId, itemId) => {
    if (!isSubscribed) return;
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
    if (!selectedTableUrl) return;
    try {
      await navigator.clipboard.writeText(selectedTableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const downloadQr = () => {
    if (!selectedTableQrSrc) return;
    const a = document.createElement("a");
    a.href = selectedTableQrSrc;
    a.download = `table-${selectedQrTable || "qr"}-${restaurantId || "restaurant"}.png`;
    a.target = "_blank";
    a.click();
  };

  const getTableMenuUrl = (tableNo) => {
    if (!restaurantId || typeof window === "undefined") return "";
    const table = tableLayouts.find((t) => String(t.table_no) === String(tableNo));
    if (!table?.qr_key) return "";
    return `${window.location.origin}/public-menu?id=${restaurantId}&table=${encodeURIComponent(String(tableNo))}&key=${encodeURIComponent(table.qr_key)}`;
  };

  const selectedTableUrl = useMemo(() => {
    if (!selectedQrTable) return "";
    return getTableMenuUrl(selectedQrTable);
  }, [selectedQrTable, restaurantId, tableLayouts]);

  const [selectedTableQrSrc, setSelectedTableQrSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!selectedTableUrl) {
      setSelectedTableQrSrc("");
      return;
    }
    QRCode.toDataURL(selectedTableUrl, { width: 340, margin: 1 })
      .then((src) => !cancelled && setSelectedTableQrSrc(src))
      .catch(() => !cancelled && setSelectedTableQrSrc(""));
    return () => {
      cancelled = true;
    };
  }, [selectedTableUrl]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="mt-3 h-4 w-72 bg-gray-200 rounded" />
          <div className="mt-8 h-64 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-end">
        <ApplyToBranchesButton what="menu" label="Menu" disabled={saving || uploadingFullMenu} />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Menu Card Images</div>
        <div className="text-xs text-gray-500 mt-1">Uploaded images are shown below.</div>

        {saveError ? <div className="mt-3 text-sm text-red-600">Save error: {saveError}</div> : null}
        {infoMsg ? <div className="mt-3 text-sm text-emerald-600">{infoMsg}</div> : null}

        <input
          ref={fullMenuFileInputRef}
          type="file"
          accept="image/*"
          multiple
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
            {uploadingFullMenu ? "Uploading..." : menuCardImages.length ? "Add More Images" : "Upload Images"}
          </button>
        </div>

        {menuCardImages.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {menuCardImages.map((url) => (
              <div key={url} className="relative rounded-xl border border-gray-200 bg-gray-50 p-1">
                <img src={url} alt="Menu card" className="w-full h-36 object-cover rounded-lg bg-white" />
                <button
                  type="button"
                  onClick={() => removeFullMenuImage(url)}
                  className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-white/95 border border-gray-200 hover:bg-white flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-gray-700" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500">No menu card images found.</div>
        )}
      </div>

      {isSubscribed ? (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">Menu</div>
          <div className="text-sm text-gray-500 mt-1">
            {isSubscribed
              ? "Build and manage your sections, items, and menu images."
              : "Catalogue editing is hidden until premium is active."}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={!isSubscribed}
              onClick={openNewSection}
              className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 px-3 text-sm font-semibold flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add section
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 p-3">
            <div className="text-sm font-semibold text-gray-900">Quick comments for every item</div>
            <div className="mt-0.5 text-xs text-gray-500">Staff tap these when taking an order, e.g. “Take away”. Add more per section when you edit a section.</div>
            <CommentPresetsEditor
              value={Array.isArray(menu.comment_presets) ? menu.comment_presets : []}
              onChange={async (list) => {
                const nextMenu = { ...menu, comment_presets: list, updated_at: new Date().toISOString() };
                setMenu(nextMenu);
                await saveMenu(nextMenu);
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <QrCode className="h-4 w-4" />
            Menu QR
          </div>

          <div className="mt-2 text-xs text-gray-500">
            {isSubscribed
              ? "Select table and share the QR. Orders will be tagged to that table."
              : "QR opens first uploaded menu image."}
          </div>

          <label className="mt-3 block">
            <span className="text-xs font-semibold text-gray-600">Select table</span>
            <select
              value={selectedQrTable}
              onChange={(e) => setSelectedQrTable(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              disabled={tableLayouts.length === 0}
            >
              {tableLayouts.length === 0 ? <option value="">No tables configured</option> : null}
              {tableLayouts.map((t) => (
                <option key={t.id} value={String(t.table_no)}>
                  {t.label || `Table ${t.table_no}`} (#{t.table_no})
                </option>
              ))}
            </select>
          </label>

          {selectedTableQrSrc ? (
            <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50">
              <img
                src={selectedTableQrSrc}
                alt={`Table ${selectedQrTable || ""} QR`}
                className="w-full rounded-lg bg-white p-2"
              />
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-500">Configure table layout first to generate table QR.</div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={copyUrl}
              disabled={!selectedTableUrl}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!selectedTableQrSrc}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={() => selectedTableUrl && window.open(selectedTableUrl, "_blank")}
              disabled={!selectedTableUrl}
              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          </div>
        </div>
      </div>

      ) : null}

      {!isSubscribed ? null : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {areas.map((a) => {
                    const on = a.id === currentArea.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => switchMenuTab(a.id, currentKind)}
                        className={`h-9 rounded-xl px-3 text-sm font-semibold ${on ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAreaModal(currentArea)}
                    aria-label="Edit area"
                    className="h-9 w-9 rounded-xl border border-gray-200 grid place-items-center hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4 text-gray-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaModal({})}
                    className="h-9 rounded-xl border border-dashed border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    + Add area
                  </button>
                </div>
                <div className={`mt-2 grid gap-1 ${currentArea.menus.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {currentArea.menus.map((kind) => {
                    const count = sections.filter((x) => inTab(x, currentArea.id, kind)).length;
                    const on = currentKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => switchMenuTab(currentArea.id, kind)}
                        className={`h-10 rounded-xl text-sm font-semibold ${on ? "bg-[#FF4800] text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >
                        {kind} menu · {count}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{currentArea.name} · {currentKind} sections</div>
                <button
                  type="button"
                  onClick={openNewSection}
                  className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 text-sm font-semibold flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {tabSections.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                  {currentKind === "Bar" ? `No bar sections in ${currentArea.name} yet. Tap Add to create one, e.g. Cocktails.` : `No kitchen sections in ${currentArea.name} yet. Tap Add to create one.`}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {tabSections.map((s, idx) => {
                    const active = s.id === selectedSectionId && !selectedSubId;
                    const subcats = Array.isArray(s.subcategories) ? s.subcategories : [];
                    return (
                      <div key={s.id}>
                      <div className={`px-4 py-3 hover:bg-gray-50 ${active ? "bg-blue-50" : "bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => selectSection(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") selectSection(s.id);
                            }}
                            className="flex-1 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              {s.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {(s.items || []).length} items {s.description ? `• ${s.description}` : ""}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSubDialog({ sectionId: s.id, id: null, name: "" })}
                              title="Add subcategory"
                              className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-2 flex items-center gap-1 text-xs font-semibold text-gray-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Sub
                            </button>
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
                              disabled={idx === tabSections.length - 1}
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
                      {subcats.map((c) => {
                        const subActive = s.id === selectedSectionId && selectedSubId === c.id;
                        const count = (s.items || []).filter((i) => i.subcategory_id === c.id).length;
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-2 border-t border-gray-50 py-2 pl-9 pr-4 hover:bg-gray-50 ${subActive ? "bg-blue-50" : "bg-white"}`}
                          >
                            <button type="button" onClick={() => selectSection(s.id, c.id)} className="flex-1 min-w-0 text-left">
                              <div className="truncate text-sm font-medium text-gray-800">↳ {c.name}</div>
                              <div className="text-xs text-gray-500">{count} items</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSubDialog({ sectionId: s.id, id: c.id, name: c.name })}
                              aria-label="Rename subcategory"
                              className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                            >
                              <Pencil className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSubcategory(s, c)}
                              aria-label="Delete subcategory"
                              className="h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </button>
                          </div>
                        );
                      })}
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
                  <div className="text-sm font-semibold text-gray-900">
                    {selectedSection ? selectedSection.name : "Items"}
                    {selectedSubName ? <span className="text-gray-500"> › {selectedSubName}</span> : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    {!selectedSection
                      ? "Select a section"
                      : selectedSubName
                      ? `New items are added to ${selectedSubName}`
                      : selectedSection.description || "Manage items in this section"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openNewItem()}
                  disabled={!selectedSectionId}
                  className="h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 px-3 text-sm font-semibold flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add item
                </button>
              </div>

              {!selectedSection ? (
                <div className="px-4 py-12 text-center text-sm text-gray-500">Select a section to manage items.</div>
              ) : itemBuckets(selectedSection, selectedSubId).every((b) => !b.items.length && !b.name) ? (
                <div className="px-4 py-12 text-center text-sm text-gray-500">
                  {selectedSubName ? `No items in ${selectedSubName} yet. Click Add item.` : "No items in this section yet."}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {itemBuckets(selectedSection, selectedSubId).map((bucket) => (
                    <React.Fragment key={bucket.id || "direct"}>
                      {bucket.name ? (
                        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50">
                          <button
                            type="button"
                            onClick={() => selectSection(selectedSection.id, bucket.id)}
                            className="text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900"
                          >
                            {bucket.name} · {bucket.items.length}
                          </button>
                          <button
                            type="button"
                            onClick={() => openNewItem(bucket.id)}
                            className="h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 text-xs font-semibold text-gray-700 inline-flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add item here
                          </button>
                        </div>
                      ) : null}
                      {bucket.name && !bucket.items.length ? (
                        <div className="px-4 py-3 text-xs text-gray-400">No items yet.</div>
                      ) : null}
                  {bucket.items.map((it) => {
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
                                {(it.modifier_groups || []).length ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    {it.modifier_groups.length} customisation{it.modifier_groups.length === 1 ? "" : "s"}
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-xs text-gray-500 mt-0.5">{it.description || "—"}</div>
                              {(it.variants || []).length ? (
                                <div className="mt-1 space-y-0.5">
                                  {it.variants.map((v) => (
                                    <div key={v.id} className={`flex items-baseline gap-2 text-sm ${v.is_available === false ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                      <span>• {v.name}</span>
                                      <span className="font-semibold">{money(v.price)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm font-semibold text-gray-900 mt-1">{money(it.price)}</div>
                              )}
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
                    </React.Fragment>
                  ))}
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
      )}

      {areaModal ? (
        <AreaModal
          initial={areaModal}
          canDelete={Boolean(areaModal.id) && areas.length > 1 && !sections.some((x) => sectionPlace(areas, x).areaId === areaModal.id)}
          onClose={() => setAreaModal(null)}
          onSave={saveArea}
          onDelete={() => deleteArea(areaModal)}
        />
      ) : null}

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
            <label className="text-sm font-semibold text-gray-700">Area and menu</label>
            <select
              value={sectionArea || currentArea.id}
              onChange={(e) => setSectionArea(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(areas.find((a) => a.id === (sectionArea || currentArea.id)) || currentArea).menus.map((g) => {
                const on = sectionGroup === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSectionGroup(g)}
                    className={`h-11 rounded-xl border text-sm font-semibold ${on ? "border-[#FF4800] bg-[#FF4800] text-white" : "border-gray-200 bg-white text-gray-700"}`}
                  >
                    {g} menu
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">Staff see each area&apos;s Kitchen and Bar menus as separate tabs when taking orders.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Quick comments</label>
            <p className="mt-0.5 text-xs text-gray-500">Shown for items in this section, e.g. “Sans tomate”, “Sans mayo”.</p>
            <CommentPresetsEditor value={sectionComments} onChange={setSectionComments} />
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
            {itemVariants.length ? (
              <div className="mt-2 rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-500">Set per variant below</div>
            ) : (
            <input
              type="text"
              value={itemPrice}
              onChange={(e) => setItemPrice(normalizePriceInput(e.target.value))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="199"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
            />
            )}
          </div>

          {(selectedSection?.subcategories || []).length ? (
            <div className="col-span-12 sm:col-span-6">
              <label className="text-sm font-semibold text-gray-700">Subcategory</label>
              <select
                value={itemSubcat}
                onChange={(e) => setItemSubcat(e.target.value)}
                className="mt-2 h-[42px] w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-300"
              >
                <option value="">None (directly in {selectedSection.name})</option>
                {selectedSection.subcategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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

          <div className="col-span-12 border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-gray-700">Variants</div>
            <p className="mt-1 mb-3 text-xs text-gray-500">
              Versions of this dish, each with its own price, e.g. Pasta with Tomato Sauce MUR 490, with Smoked Marlin MUR 690. Staff and guests pick one.
            </p>
            <VariantsEditor variants={itemVariants} onChange={setItemVariants} />
          </div>

          <div className="col-span-12 border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-gray-700">Customisations</div>
            <p className="mt-1 mb-3 text-xs text-gray-500">
              Choices staff and guests pick when ordering, e.g. Size (required, pick 1) or Extras (optional, up to 3). Prices add to the item price.
            </p>
            <ModifierGroupsEditor groups={itemGroups} onChange={setItemGroups} />
          </div>

          {itemError ? <div className="col-span-12 text-sm text-red-600">{itemError}</div> : null}
        </div>
      </Dialog>
      <Dialog
        open={Boolean(subDialog)}
        onClose={() => setSubDialog(null)}
        title={subDialog?.id ? "Rename subcategory" : `Add subcategory to ${sections.find((x) => x.id === subDialog?.sectionId)?.name || "section"}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubDialog(null)}
              className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveSubcategory}
              disabled={!subDialog?.name.trim()}
              className="h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 text-sm font-semibold"
            >
              {subDialog?.id ? "Save" : "Create"}
            </button>
          </div>
        }
      >
        <label className="text-sm font-semibold text-gray-700">Subcategory name</label>
        <input
          autoFocus
          value={subDialog?.name || ""}
          onChange={(e) => setSubDialog((d) => (d ? { ...d, name: e.target.value } : d))}
          onKeyDown={(e) => e.key === "Enter" && saveSubcategory()}
          placeholder="e.g. Pasta La Vista ! Nos Tagliatelles Italiennes"
          className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-300"
        />
        <p className="mt-2 text-xs text-gray-500">After creating it, click Add item to put dishes inside it.</p>
      </Dialog>
    </div>
  );
}
