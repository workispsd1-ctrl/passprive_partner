"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gift,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Store,
  Tag,
  TicketPercent,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useStores } from "@/lib/store-partner/useStores";
import { SkeletonBlock } from "@/components/ui/PageSkeletons";

const THEME_ACCENT = "#771FA8";
const THEME_ACCENT_SOFT = "rgba(119, 31, 168, 0.12)";
const THEME_BORDER = "rgba(119, 31, 168, 0.18)";

function emptyOfferForm() {
  return {
    title: "",
    description: "",
    badgeText: "",
    offerType: "percentage",
    discountValue: "",
    maximumDiscount: "",
    minSpend: "",
    isActive: true,
    startsAt: "",
    endsAt: "",
    metadata: {},
  };
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `MUR ${amount.toFixed(2)}`;
}

function formatAmountCompact(value) {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatDate(value) {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No date";
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateInput(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toStartOfDayIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toEndOfDayIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasOfferContent(raw) {
  if (!raw || typeof raw !== "object") return false;
  return Boolean(
    raw.title ||
      raw.name ||
      raw.offer_name ||
      raw.label ||
    raw.description ||
      raw.subtitle ||
      raw.details ||
      raw.badge_text ||
      raw.badge ||
      raw.discount_value ||
      raw.maximum_discount ||
      raw.value ||
      raw.amount ||
      raw.discountAmount ||
      raw.metadata
  );
}

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "active", "enabled", "live", "published"].includes(normalized);
}

function statusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (["ACTIVE", "LIVE", "PUBLISHED"].includes(normalized)) {
    return { bg: "rgba(22, 163, 74, 0.12)", color: "#166534", label: "Active" };
  }
  if (["PAUSED", "INACTIVE", "DRAFT"].includes(normalized)) {
    return { bg: THEME_ACCENT_SOFT, color: THEME_ACCENT, label: toTitleCase(normalized) };
  }
  if (["EXPIRED", "ENDED", "CANCELLED", "ARCHIVED"].includes(normalized)) {
    return { bg: "rgba(220, 38, 38, 0.12)", color: "#B91C1C", label: toTitleCase(normalized) };
  }
  return { bg: "rgba(71, 85, 105, 0.12)", color: "#475569", label: normalized ? toTitleCase(normalized) : "Unknown" };
}

function normalizeOffer(raw, index) {
  if (!hasOfferContent(raw)) return null;

  const title = raw?.title || raw?.name || raw?.offer_name || raw?.label || `Offer ${index + 1}`;
  const discountValue = raw?.discount_value ?? raw?.value ?? raw?.amount ?? raw?.discountAmount ?? null;
  const maximumDiscount = raw?.maximum_discount ?? raw?.max_discount_amount ?? null;
  const offerType = String(raw?.offer_type || raw?.discount_type || raw?.type || raw?.value_type || "percentage").toLowerCase();
  const startsAt = raw?.starts_at || raw?.start_date || raw?.startDate || null;
  const endsAt = raw?.ends_at || raw?.end_date || raw?.endDate || raw?.expires_at || null;
  const metadata = raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
  const isActive = isTruthyFlag(raw?.is_active) || isTruthyFlag(raw?.active) || isTruthyFlag(raw?.enabled) || isTruthyFlag(raw?.isEnabled);

  return {
    id: raw?.id || raw?.offer_id || `${title}-${index}`,
    title,
    description: raw?.description || raw?.subtitle || raw?.details || "",
    badgeText: raw?.badge_text || raw?.badge || "",
    offerType,
    discountValue,
    maximumDiscount,
    minSpend: raw?.min_spend ?? raw?.min_bill_amount ?? raw?.minimum_bill ?? raw?.minAmount ?? null,
    startsAt,
    endsAt,
    isActive,
    status: isActive ? "ACTIVE" : "INACTIVE",
    metadata,
  };
}

function formFromOffer(offer) {
  return {
    title: offer?.title || "",
    description: offer?.description || "",
    badgeText: offer?.badgeText || "",
    offerType: String(offer?.offerType || "percentage").toLowerCase(),
    discountValue: offer?.discountValue ?? "",
    maximumDiscount: offer?.maximumDiscount ?? "",
    minSpend: offer?.minSpend ?? "",
    isActive: Boolean(offer?.isActive),
    startsAt: formatDateInput(offer?.startsAt),
    endsAt: formatDateInput(offer?.endsAt),
    metadata: offer?.metadata && typeof offer.metadata === "object" && !Array.isArray(offer.metadata) ? offer.metadata : {},
  };
}

function offerTypeLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "percentage") return "Percentage";
  if (normalized === "flat") return "Flat";
  return normalized ? toTitleCase(normalized) : "Offer";
}

function formatOfferValueLabel(offer) {
  const type = String(offer.offerType || "").toLowerCase();
  const numericValue = offer.discountValue === null || offer.discountValue === "" ? null : Number(offer.discountValue);

  if (numericValue === null || Number.isNaN(numericValue)) return "Offer details available";

  if (type === "percentage") return `${formatAmountCompact(numericValue)}% off`;
  if (type === "flat") return `MUR ${formatAmountCompact(numericValue)} off`;
  return `MUR ${formatAmountCompact(numericValue)} off`;
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div
      className="rounded-[28px] border p-5 shadow-sm"
      style={{
        background: "rgba(255,255,255,0.72)",
        borderColor: THEME_BORDER,
        boxShadow: "0 18px 40px rgba(119, 31, 168, 0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
          {hint ? <div className="mt-2 text-sm text-slate-600">{hint}</div> : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function OffersListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-[28px] border bg-white p-5 shadow-sm"
          style={{ borderColor: THEME_BORDER }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-3">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-8 w-48" />
              <SkeletonBlock className="h-4 w-full max-w-xl" />
              <div className="flex flex-wrap gap-3">
                <SkeletonBlock className="h-10 w-32 rounded-full" />
                <SkeletonBlock className="h-10 w-28 rounded-full" />
                <SkeletonBlock className="h-10 w-36 rounded-full" />
              </div>
            </div>
            <div className="flex gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OfferCard({ offer, onEdit, onDelete }) {
  const tone = statusTone(offer.status);
  const metadataKeys = Object.keys(offer.metadata || {}).slice(0, 3);

  return (
    <div
      className="rounded-[30px] border p-5 shadow-sm"
      style={{
        background: "rgba(255,255,255,0.88)",
        borderColor: THEME_BORDER,
        boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{offer.title}</h3>
            <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: tone.bg, color: tone.color }}>
              {tone.label}
            </span>
            <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
              {offerTypeLabel(offer.offerType)}
            </span>
            {offer.badgeText ? (
              <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
                {offer.badgeText}
              </span>
            ) : null}
          </div>
          {offer.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{offer.description}</p> : null}
        </div>

        <div className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
          <TicketPercent className="h-4 w-4" />
          {formatOfferValueLabel(offer)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Minimum spend</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {offer.minSpend !== null && offer.minSpend !== "" ? formatCurrency(offer.minSpend) : "No minimum"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Maximum discount</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {offer.maximumDiscount !== null && offer.maximumDiscount !== "" ? formatCurrency(offer.maximumDiscount) : "No cap"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Validity</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatDate(offer.startsAt)} to {formatDate(offer.endsAt)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Metadata</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {metadataKeys.length ? metadataKeys.join(", ") : "No metadata set"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(offer)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}
          >
            <Pencil className="h-4 w-4" />
            Edit offer
          </button>
          <button
            type="button"
            onClick={() => onDelete(offer)}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-red-600"
            style={{ borderColor: "rgba(220, 38, 38, 0.18)", background: "rgba(220, 38, 38, 0.06)" }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ open, offerTitle, deleting, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-[28px] border bg-white shadow-2xl" style={{ borderColor: THEME_BORDER }}>
        <div className="border-b px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <h2 className="text-lg font-semibold text-slate-900">Delete offer</h2>
          <p className="mt-1 text-sm text-slate-600">
            {offerTitle ? `This will permanently remove “${offerTitle}”.` : "This will permanently remove the selected offer."}
          </p>
        </div>

        <div className="px-6 py-5 text-sm text-slate-600">
          Deleted offers cannot be recovered.
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border px-5 py-2.5 text-sm font-semibold text-slate-700"
            style={{ borderColor: THEME_BORDER }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete offer
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyOffers({ storeName }) {
  return (
    <div className="rounded-[32px] border px-6 py-12 text-center shadow-sm" style={{ background: "rgba(255,255,255,0.82)", borderColor: THEME_BORDER }}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px]" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
        <Gift className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">No offers added yet</h3>
      <p className="mt-2 text-sm text-slate-600">
        {storeName ? `${storeName} does not have any offers in the store record yet.` : "No offers found for this store."}
      </p>
    </div>
  );
}

function OfferEditor({ open, mode, form, saving, onChange, onClose, onSave }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-3xl rounded-[32px] border bg-white shadow-2xl" style={{ borderColor: THEME_BORDER }}>
        <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{mode === "edit" ? "Edit offer" : "Create offer"}</h2>
            <p className="mt-1 text-sm text-slate-500">This saves directly into the selected store&apos;s offers data.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600" style={{ borderColor: THEME_BORDER }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Offer title</div>
            <input value={form.title} onChange={(e) => onChange("title", e.target.value)} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block md:col-span-2">
            <div className="mb-2 text-sm font-medium text-slate-700">Description</div>
            <textarea value={form.description} onChange={(e) => onChange("description", e.target.value)} rows={3} className="w-full rounded-2xl border px-4 py-3 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Badge text</div>
            <input value={form.badgeText} onChange={(e) => onChange("badgeText", e.target.value)} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Offer type</div>
            <select value={form.offerType} onChange={(e) => onChange("offerType", e.target.value)} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }}>
              <option value="flat">Flat - Fixed amount discount (MUR)</option>
              <option value="percentage">Percentage - % discount off bill</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">
              {form.offerType === "percentage" ? "Discount value (%)" : "Discount value (MUR)"}
            </div>
            <input value={form.discountValue} onChange={(e) => onChange("discountValue", e.target.value)} type="number" min="0" step="0.01" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
            <div className="mt-2 text-xs text-slate-500">
              {form.offerType === "percentage" && "Enter value between 0-100"}
              {form.offerType === "flat" && "Enter fixed amount in MUR"}
            </div>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Maximum discount (MUR)</div>
            <input value={form.maximumDiscount} onChange={(e) => onChange("maximumDiscount", e.target.value)} type="number" min="0" step="0.01" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
            <div className="mt-2 text-xs text-slate-500">
              {form.offerType === "percentage" && "Cap the maximum discount amount in MUR"}
              {form.offerType === "flat" && "Optional cap on the flat discount"}
            </div>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Minimum spend (MUR)</div>
            <input value={form.minSpend} onChange={(e) => onChange("minSpend", e.target.value)} type="number" min="0" step="0.01" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
            <div className="mt-2 text-xs text-slate-500">
              Leave empty for no minimum requirement
            </div>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Start date</div>
            <input value={form.startsAt} onChange={(e) => onChange("startsAt", e.target.value)} type="date" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">End date</div>
            <input value={form.endsAt} onChange={(e) => onChange("endsAt", e.target.value)} type="date" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Active</div>
            <select value={form.isActive ? "true" : "false"} onChange={(e) => onChange("isActive", e.target.value === "true")} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-6 py-5" style={{ borderColor: THEME_BORDER }}>
          <button type="button" onClick={onClose} className="rounded-full border px-5 py-2.5 text-sm font-semibold text-slate-700" style={{ borderColor: THEME_BORDER }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: THEME_ACCENT }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "edit" ? "Save changes" : "Create offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StorePartnerOffersRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferredStoreId = searchParams.get("store_id") || null;
  const isCreateRoute = pathname === "/store-partner/offers/create";
  const { loading: storesLoading, selectedStoreId, selectedStore } = useStores(preferredStoreId);
  const createRouteHref = selectedStoreId ? `/store-partner/offers/create?store_id=${selectedStoreId}` : "/store-partner/offers/create";
  const offersListHref = selectedStoreId ? `/store-partner/offers?store_id=${selectedStoreId}` : "/store-partner/offers";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [storeRecord, setStoreRecord] = useState(null);
  const [offersRows, setOffersRows] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editorOfferId, setEditorOfferId] = useState("");
  const [editorForm, setEditorForm] = useState(emptyOfferForm());
  const autoOpenCreateRef = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOfferId, setDeleteOfferId] = useState("");
  const [deleteOfferTitle, setDeleteOfferTitle] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStoreOffers(silent = false) {
      if (!selectedStoreId) {
        if (!cancelled) {
          setStoreRecord(null);
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const [storeRes, offersRes] = await Promise.all([
          supabaseBrowser
            .from("stores")
            .select("id,name,city,logo_url,updated_at,is_active")
            .eq("id", selectedStoreId)
            .maybeSingle(),
          supabaseBrowser
            .from("store_offers")
            .select("id,title,description,badge_text,offer_type,discount_value,maximum_discount,min_spend,start_at,end_at,is_active,metadata,updated_at")
            .eq("store_id", selectedStoreId)
            .order("created_at", { ascending: false }),
        ]);

        if (storeRes.error) throw storeRes.error;
        if (offersRes.error) throw offersRes.error;
        if (!cancelled) {
          setStoreRecord(storeRes.data || null);
          setOffersRows(offersRes.data || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load offers.");
          setStoreRecord(null);
          setOffersRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadStoreOffers();
    return () => {
      cancelled = true;
    };
  }, [selectedStoreId]);

  const offers = useMemo(() => {
    return offersRows.map((row, index) =>
      normalizeOffer(
        {
          ...row,
          name: row.title,
          badge: row.badge_text,
          offer_type: row.offer_type,
          maximum_discount: row.maximum_discount,
          min_spend: row.min_spend,
          starts_at: row.start_at,
          ends_at: row.end_at,
          is_active: row.is_active,
          metadata: row.metadata,
        },
        index
      )
    ).filter(Boolean);
  }, [offersRows]);

  const activeOffers = useMemo(() => offers.filter((offer) => offer.isActive).length, [offers]);
  const inactiveOffers = Math.max(offers.length - activeOffers, 0);
  const displayStore = storeRecord || selectedStore;

  const handleRefresh = async () => {
    if (!selectedStoreId) return;
    try {
      setRefreshing(true);
      setError("");
      const [storeRes, offersRes] = await Promise.all([
        supabaseBrowser
          .from("stores")
          .select("id,name,city,logo_url,updated_at,is_active")
          .eq("id", selectedStoreId)
          .maybeSingle(),
        supabaseBrowser
          .from("store_offers")
            .select("id,title,description,badge_text,offer_type,discount_value,maximum_discount,min_spend,start_at,end_at,is_active,metadata,updated_at")
          .eq("store_id", selectedStoreId)
          .order("created_at", { ascending: false }),
      ]);
      if (storeRes.error) throw storeRes.error;
      if (offersRes.error) throw offersRes.error;
      setStoreRecord(storeRes.data || null);
      setOffersRows(offersRes.data || []);
    } catch (e) {
      setError(e?.message || "Failed to refresh offers.");
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
    if (!isCreateRoute) {
      router.push(createRouteHref);
      return;
    }

    setEditorMode("create");
    setEditorOfferId("");
    setEditorForm(emptyOfferForm());
    setEditorOpen(true);
  };

  const openEdit = (offer) => {
    setEditorMode("edit");
    setEditorOfferId(String(offer.id));
    setEditorForm(formFromOffer(offer));
    setEditorOpen(true);
  };

  const openDelete = (offer) => {
    setDeleteOfferId(String(offer.id));
    setDeleteOfferTitle(String(offer.title || ""));
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteOfferId("");
    setDeleteOfferTitle("");
  };

  const handleEditorChange = (key, value) => {
    setEditorForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!isCreateRoute || autoOpenCreateRef.current === true) return;
    if (!selectedStoreId) return;

    autoOpenCreateRef.current = true;
    setEditorMode("create");
    setEditorOfferId("");
    setEditorForm(emptyOfferForm());
    setEditorOpen(true);
  }, [isCreateRoute, selectedStoreId]);

  const handleSaveOffer = async () => {
    if (!selectedStoreId) return;
    if (!String(editorForm.title || "").trim()) {
      setError("Offer title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        store_id: selectedStoreId,
        title: String(editorForm.title || "").trim(),
        description: String(editorForm.description || "").trim() || null,
        badge_text: String(editorForm.badgeText || "").trim() || null,
        offer_type: String(editorForm.offerType || "percentage").trim().toLowerCase(),
        discount_value: toNumberOrNull(editorForm.discountValue),
        maximum_discount: toNumberOrNull(editorForm.maximumDiscount),
        min_spend: toNumberOrNull(editorForm.minSpend),
        start_at: toStartOfDayIsoOrNull(editorForm.startsAt),
        end_at: toEndOfDayIsoOrNull(editorForm.endsAt),
        is_active: Boolean(editorForm.isActive),
        metadata: editorForm.metadata && typeof editorForm.metadata === "object" && !Array.isArray(editorForm.metadata) ? editorForm.metadata : {},
      };

      const query =
        editorMode === "edit"
          ? supabaseBrowser.from("store_offers").update(payload).eq("id", editorOfferId)
          : supabaseBrowser.from("store_offers").insert(payload);

      const { error: updateError } = await query;
      if (updateError) throw updateError;

      await handleRefresh();
      if (isCreateRoute) {
        setEditorOpen(false);
        router.replace(offersListHref);
      } else {
        setEditorOpen(false);
      }
    } catch (e) {
      setError(e?.message || "Failed to save offer.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!selectedStoreId || !deleteOfferId) return;

    try {
      setDeleting(true);
      setError("");

      const { error: deleteError } = await supabaseBrowser
        .from("store_offers")
        .delete()
        .eq("id", deleteOfferId)
        .eq("store_id", selectedStoreId);

      if (deleteError) throw deleteError;

      if (String(editorOfferId) === String(deleteOfferId)) {
        setEditorOpen(false);
      }

      closeDelete();
      await handleRefresh();
    } catch (e) {
      setError(e?.message || "Failed to delete offer.");
    } finally {
      setDeleting(false);
    }
  };

  const closeEditor = () => {
    if (isCreateRoute) {
      setEditorOpen(false);
      router.replace(offersListHref);
      return;
    }
    setEditorOpen(false);
  };

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section
          className="overflow-hidden rounded-[36px] border px-6 py-6 shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.75) 48%, rgba(119,31,168,0.08) 100%)",
            borderColor: THEME_BORDER,
            boxShadow: "0 24px 60px rgba(119, 31, 168, 0.10)",
          }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}>
                <Tag className="h-3.5 w-3.5" />
                Store Offers
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Offers for the selected store</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                This page reads directly from the store offers table and lets you manage the live offers list for the selected store.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
                  <Store className="h-4 w-4" style={{ color: THEME_ACCENT }} />
                  {displayStore?.name || "No store selected"}
                </span>
                {displayStore?.city ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
                    <MapPin className="h-4 w-4" style={{ color: THEME_ACCENT }} />
                    {displayStore.city}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={openCreate}
                disabled={loading || storesLoading || !selectedStoreId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: THEME_BORDER, color: THEME_ACCENT, background: "#fff" }}
              >
                <Plus className="h-4 w-4" />
                Create offer
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading || storesLoading || !selectedStoreId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: THEME_ACCENT, boxShadow: "0 12px 24px rgba(119, 31, 168, 0.22)" }}
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Gift} label="Total Offers" value={loading ? "..." : String(offers.length)} hint="Live count from the offers table" />
          <StatCard icon={TicketPercent} label="Active Offers" value={loading ? "..." : String(activeOffers)} hint="Offers currently marked active/live" />
          <StatCard icon={Tag} label="Inactive Offers" value={loading ? "..." : String(inactiveOffers)} hint={storeRecord?.updated_at ? `Updated ${formatDate(storeRecord.updated_at)}` : "Waiting for store data"} />
        </section>

        <section className="rounded-[32px] border p-5 shadow-sm" style={{ background: "rgba(255,255,255,0.8)", borderColor: THEME_BORDER }}>
          {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          {storesLoading || loading ? (
            <OffersListSkeleton />
          ) : offers.length ? (
            <div className="space-y-4">
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onEdit={openEdit} onDelete={openDelete} />
              ))}
            </div>
          ) : (
            <EmptyOffers storeName={displayStore?.name} />
          )}
        </section>
      </div>

      <OfferEditor
        open={editorOpen || isCreateRoute}
        mode={editorMode}
        form={editorForm}
        saving={saving}
        onChange={handleEditorChange}
        onClose={closeEditor}
        onSave={handleSaveOffer}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        offerTitle={deleteOfferTitle}
        deleting={deleting}
        onCancel={closeDelete}
        onConfirm={handleDeleteOffer}
      />
    </div>
  );
}
