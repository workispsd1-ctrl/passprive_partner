"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Gift,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Tag,
  TicketPercent,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useStores } from "@/lib/store-partner/useStores";

const THEME_ACCENT = "#771FA8";
const THEME_ACCENT_SOFT = "rgba(119, 31, 168, 0.12)";
const THEME_BORDER = "rgba(119, 31, 168, 0.18)";

function emptyOfferForm() {
  return {
    title: "",
    description: "",
    badgeText: "",
    discountType: "PERCENT",
    discountValue: "",
    minBillAmount: "",
    status: "ACTIVE",
    startsAt: "",
    endsAt: "",
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
      raw.value ||
      raw.amount ||
      raw.discountAmount
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
  const discountType = raw?.discount_type || raw?.type || raw?.offer_type || raw?.value_type || "PERCENT";
  const startsAt = raw?.starts_at || raw?.start_date || raw?.startDate || null;
  const endsAt = raw?.ends_at || raw?.end_date || raw?.endDate || raw?.expires_at || null;
  const explicitStatus = String(raw?.status || "").trim().toUpperCase();
  const activeFlag =
    isTruthyFlag(raw?.is_active) ||
    isTruthyFlag(raw?.active) ||
    isTruthyFlag(raw?.enabled) ||
    isTruthyFlag(raw?.isEnabled);
  const isActive =
    activeFlag ||
    ["ACTIVE", "LIVE", "PUBLISHED"].includes(explicitStatus);
  const status = isActive ? "ACTIVE" : explicitStatus || "PAUSED";

  return {
    id: raw?.id || raw?.offer_id || `${title}-${index}`,
    title,
    description: raw?.description || raw?.subtitle || raw?.details || "",
    badgeText: raw?.badge_text || raw?.badge || "",
    minBillAmount: raw?.min_bill_amount ?? raw?.minimum_bill ?? raw?.minAmount ?? null,
    discountValue,
    discountType,
    startsAt,
    endsAt,
    status,
    isActive,
  };
}

function serializeOffer(form, existingId) {
  return {
    id: existingId || crypto.randomUUID(),
    title: String(form.title || "").trim(),
    description: String(form.description || "").trim(),
    badge_text: String(form.badgeText || "").trim(),
    discount_type: String(form.discountType || "PERCENT").toUpperCase(),
    discount_value: form.discountValue === "" ? null : Number(form.discountValue),
    min_bill_amount: form.minBillAmount === "" ? null : Number(form.minBillAmount),
    status: String(form.status || "ACTIVE").toUpperCase(),
    starts_at: form.startsAt || null,
    ends_at: form.endsAt || null,
    is_active: ["ACTIVE", "LIVE", "PUBLISHED"].includes(String(form.status || "ACTIVE").toUpperCase()),
  };
}

function formFromOffer(offer) {
  return {
    title: offer?.title || "",
    description: offer?.description || "",
    badgeText: offer?.badgeText || "",
    discountType: String(offer?.discountType || "PERCENT").toUpperCase(),
    discountValue: offer?.discountValue ?? "",
    minBillAmount: offer?.minBillAmount ?? "",
    status: String(offer?.status || "ACTIVE").toUpperCase(),
    startsAt: formatDateInput(offer?.startsAt),
    endsAt: formatDateInput(offer?.endsAt),
  };
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

function OfferCard({ offer, onEdit }) {
  const tone = statusTone(offer.status);
  const valueLabel =
    offer.discountValue === null || offer.discountValue === ""
      ? "Offer details available"
      : String(offer.discountType || "").toUpperCase().includes("PERCENT")
      ? `MUR ${formatAmountCompact(offer.discountValue)}% OFF`
      : `MUR ${formatAmountCompact(offer.discountValue)} FLAT OFF`;

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
          {valueLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Minimum bill</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {offer.minBillAmount !== null && offer.minBillAmount !== "" ? formatCurrency(offer.minBillAmount) : "No minimum"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Validity</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatDate(offer.startsAt)} to {formatDate(offer.endsAt)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onEdit(offer)}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: THEME_ACCENT_SOFT, color: THEME_ACCENT }}
        >
          <Pencil className="h-4 w-4" />
          Edit offer
        </button>
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
            <h2 className="text-xl font-semibold text-slate-900">{mode === "edit" ? "Edit offer" : "Add offer"}</h2>
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
            <div className="mb-2 text-sm font-medium text-slate-700">Status</div>
            <select value={form.status} onChange={(e) => onChange("status", e.target.value)} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Discount type</div>
            <select value={form.discountType} onChange={(e) => onChange("discountType", e.target.value)} className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }}>
              <option value="PERCENT">Percent</option>
              <option value="FLAT">Flat amount</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Maximum discount</div>
            <input value={form.discountValue} onChange={(e) => onChange("discountValue", e.target.value)} type="number" min="0" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Minimum bill amount</div>
            <input value={form.minBillAmount} onChange={(e) => onChange("minBillAmount", e.target.value)} type="number" min="0" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">Start date</div>
            <input value={form.startsAt} onChange={(e) => onChange("startsAt", e.target.value)} type="date" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-medium text-slate-700">End date</div>
            <input value={form.endsAt} onChange={(e) => onChange("endsAt", e.target.value)} type="date" className="h-11 w-full rounded-2xl border px-4 outline-none" style={{ borderColor: THEME_BORDER }} />
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
            {mode === "edit" ? "Save changes" : "Add offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StorePartnerOffersRoute() {
  const { loading: storesLoading, selectedStoreId, selectedStore } = useStores();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [storeRecord, setStoreRecord] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editorOfferId, setEditorOfferId] = useState("");
  const [editorForm, setEditorForm] = useState(emptyOfferForm());

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

        const { data, error: queryError } = await supabaseBrowser
          .from("stores")
          .select("id,name,city,logo_url,offers,updated_at,is_active")
          .eq("id", selectedStoreId)
          .maybeSingle();

        if (queryError) throw queryError;
        if (!cancelled) setStoreRecord(data || null);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load offers.");
          setStoreRecord(null);
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
    const raw = storeRecord?.offers;
    if (!Array.isArray(raw)) return [];
    return raw.map((row, index) => normalizeOffer(row, index)).filter(Boolean);
  }, [storeRecord]);

  const activeOffers = useMemo(() => offers.filter((offer) => offer.isActive).length, [offers]);
  const inactiveOffers = Math.max(offers.length - activeOffers, 0);
  const displayStore = storeRecord || selectedStore;

  const handleRefresh = async () => {
    if (!selectedStoreId) return;
    try {
      setRefreshing(true);
      setError("");
      const { data, error: queryError } = await supabaseBrowser
        .from("stores")
        .select("id,name,city,logo_url,offers,updated_at,is_active")
        .eq("id", selectedStoreId)
        .maybeSingle();
      if (queryError) throw queryError;
      setStoreRecord(data || null);
    } catch (e) {
      setError(e?.message || "Failed to refresh offers.");
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
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

  const handleEditorChange = (key, value) => {
    setEditorForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveOffer = async () => {
    if (!selectedStoreId) return;
    if (!String(editorForm.title || "").trim()) {
      setError("Offer title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const currentOffers = Array.isArray(storeRecord?.offers) ? storeRecord.offers.filter(hasOfferContent) : [];
      const nextOffer = serializeOffer(editorForm, editorMode === "edit" ? editorOfferId : "");
      const nextOffers =
        editorMode === "edit"
          ? currentOffers.map((row, index) => {
              const normalized = normalizeOffer(row, index);
              return String(normalized?.id || "") === String(editorOfferId) ? nextOffer : row;
            })
          : [...currentOffers, nextOffer];

      const { data, error: updateError } = await supabaseBrowser
        .from("stores")
        .update({ offers: nextOffers })
        .eq("id", selectedStoreId)
        .select("id,name,city,logo_url,offers,updated_at,is_active")
        .maybeSingle();

      if (updateError) throw updateError;

      setStoreRecord(data || null);
      setEditorOpen(false);
    } catch (e) {
      setError(e?.message || "Failed to save offer.");
    } finally {
      setSaving(false);
    }
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
                This page reads directly from the selected store record, filters out empty placeholder entries, and lets you manage the real offers list.
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
                Add offer
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
          <StatCard icon={Gift} label="Total Offers" value={loading ? "..." : String(offers.length)} hint="Live count from the selected store record" />
          <StatCard icon={TicketPercent} label="Active Offers" value={loading ? "..." : String(activeOffers)} hint="Offers currently marked active/live" />
          <StatCard icon={Tag} label="Inactive Offers" value={loading ? "..." : String(inactiveOffers)} hint={storeRecord?.updated_at ? `Updated ${formatDate(storeRecord.updated_at)}` : "Waiting for store data"} />
        </section>

        <section className="rounded-[32px] border p-5 shadow-sm" style={{ background: "rgba(255,255,255,0.8)", borderColor: THEME_BORDER }}>
          {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          {storesLoading || loading ? (
            <div className="flex items-center gap-3 py-10 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading store offers...
            </div>
          ) : offers.length ? (
            <div className="space-y-4">
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onEdit={openEdit} />
              ))}
            </div>
          ) : (
            <EmptyOffers storeName={displayStore?.name} />
          )}
        </section>
      </div>

      <OfferEditor
        open={editorOpen}
        mode={editorMode}
        form={editorForm}
        saving={saving}
        onChange={handleEditorChange}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveOffer}
      />
    </div>
  );
}
