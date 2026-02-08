"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ArrowLeft, Loader2, Tag } from "lucide-react";

function uid() {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

const TERMS = [
  { id: "validity", label: "I confirm this offer has clear validity dates and terms." },
  { id: "compliance", label: "I confirm this offer complies with pricing and advertising policies." },
  { id: "honor", label: "I agree to honor this offer for all selected stores." },
];

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

function Field({ label, children, required = false }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-2">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function CreateOfferPage() {
  const router = useRouter();

  const [loadingStores, setLoadingStores] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);
  const [applyAllStores, setApplyAllStores] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);

  const [title, setTitle] = useState("");
  const [discountType, setDiscountType] = useState("PERCENT"); // PERCENT | FLAT
  const [value, setValue] = useState("");
  const [minBill, setMinBill] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [stackable, setStackable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(
    TERMS.reduce((acc, t) => ({ ...acc, [t.id]: false }), {})
  );

  const allTermsAccepted = useMemo(
    () => TERMS.every((t) => acceptedTerms[t.id]),
    [acceptedTerms]
  );

  const effectiveStoreIds = useMemo(() => {
    if (applyAllStores) return stores.map((s) => String(s.id));
    return selectedStoreIds;
  }, [applyAllStores, stores, selectedStoreIds]);

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!value || Number(value) <= 0) return false;
    if (!startAt || !endAt) return false;
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) return false;
    if (!effectiveStoreIds.length) return false;
    if (!allTermsAccepted) return false;
    return true;
  }, [title, value, startAt, endAt, effectiveStoreIds, allTermsAccepted]);

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

        // 1) Stores where user is owner
        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name,city,is_active,offers")
          .eq("owner_user_id", userId);

        if (ownerRes.error) throw ownerRes.error;

        // 2) Stores where user is in store_members (manager/owner/etc.)
        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id (id,name,city,is_active,offers)")
          .eq("user_id", userId);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || [])
          .map((r) => r.stores)
          .filter(Boolean);

        // Merge + dedupe
        const mergedMap = new Map();
        [...ownerStores, ...memberStores].forEach((s) => {
          mergedMap.set(String(s.id), s);
        });

        const list = Array.from(mergedMap.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!cancelled) {
          setStores(list);
          if (list.length) setSelectedStoreIds([String(list[0].id)]);
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

  const buildOfferPayload = () => {
    const nValue = Number(value || 0);
    const nMinBill = minBill ? Number(minBill) : null;

    return {
      id: uid(),
      type: "CUSTOM",
      title: title.trim(),
      subtitle: null,
      badge_text: discountType === "PERCENT" ? `${nValue}% OFF` : `MUR ${nValue} OFF`,
      value_type: discountType,
      percent: discountType === "PERCENT" ? nValue : null,
      flat_amount: discountType === "FLAT" ? nValue : null,
      currency: "MUR",
      min_bill: Number.isFinite(nMinBill) ? nMinBill : null,
      max_discount: null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      requires_pass: false,
      pass_tiers: [],
      coupon_code: couponCode.trim() || null,
      stackable: !!stackable,
      terms: "Accepted: " + TERMS.map((t) => t.label).join(" "),
      enabled: true,
      created_at: new Date().toISOString(),
    };
  };

  const appendOfferAndUpdateStore = async (store, offer) => {
    const existing = Array.isArray(store.offers) ? store.offers : [];
    const nextOffers = [...existing, offer];

    const { error } = await supabaseBrowser
      .from("stores")
      .update({ offers: nextOffers })
      .eq("id", store.id);

    if (error) throw error;
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      setErr("");
      setOk("");

      const offer = buildOfferPayload();
      const targets = stores.filter((s) => effectiveStoreIds.includes(String(s.id)));

      if (!targets.length) throw new Error("No stores selected.");

      await Promise.all(targets.map((s) => appendOfferAndUpdateStore(s, offer)));

      setOk(`Offer created for ${targets.length} store(s).`);
      setTimeout(() => router.push("/store-partner/offers"), 800);
    } catch (e) {
      setErr(e?.message || "Failed to create offer.");
    } finally {
      setSaving(false);
    }
  };

  const onToggleStore = (id, checked) => {
    setSelectedStoreIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(String(id));
      else set.delete(String(id));
      return Array.from(set);
    });
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
            
          <button
            type="button"
            onClick={() => router.push("/store-partner/offers")}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        {loadingStores ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
            <div className="h-5 w-52 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-28 rounded-2xl bg-gray-100 border border-gray-200" />
          </div>
        ) : (
          <Card
            title="Create Store Offer"
            subtitle="Select one, multiple, or all stores and publish one offer."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Stores" required>
                <div className="space-y-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={applyAllStores}
                      onChange={(e) => setApplyAllStores(e.target.checked)}
                    />
                    Apply to all stores ({stores.length})
                  </label>

                  <div className="max-h-44 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
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
                            {s.name} {s.city ? `• ${s.city}` : ""}{" "}
                            {s.is_active === false ? "(Inactive)" : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Field>

              <Field label="Offer Title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="Weekend Special"
                />
              </Field>

              <Field label="Discount Type">
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FLAT">Flat Amount (MUR)</option>
                </select>
              </Field>

              <Field label={discountType === "PERCENT" ? "Discount (%)" : "Discount (MUR)"} required>
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder={discountType === "PERCENT" ? "10" : "50"}
                />
              </Field>

              <Field label="Minimum Bill (optional)">
                <input
                  type="number"
                  min="0"
                  value={minBill}
                  onChange={(e) => setMinBill(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="500"
                />
              </Field>

              <Field label="Coupon Code (optional)">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="SAVE10"
                />
              </Field>

              <Field label="Start Date & Time" required>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                />
              </Field>

              <Field label="End Date & Time" required>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                />
              </Field>

              <Field label="Stackable">
                <label className="h-11 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={stackable}
                    onChange={(e) => setStackable(e.target.checked)}
                  />
                  Allow stacking with other offers
                </label>
              </Field>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Terms & Conditions</div>
              <div className="mt-3 space-y-2">
                {TERMS.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={acceptedTerms[t.id]}
                      onChange={(e) =>
                        setAcceptedTerms((prev) => ({ ...prev, [t.id]: e.target.checked }))
                      }
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving || loadingStores}
                className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                Create Offer
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
