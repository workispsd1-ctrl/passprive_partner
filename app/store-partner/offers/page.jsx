"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Loader2, Tag, Gift } from "lucide-react";

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

const VISIT_STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const REWARD_MODES = {
  NONE: "NONE",
  FLAT: "FLAT",
  PERCENT: "PERCENT",
  GIFT: "GIFT",
};

function createDefaultVisitRewards() {
  return VISIT_STEPS.reduce((acc, v) => {
    acc[String(v)] = { mode: REWARD_MODES.NONE, amount: "", gift: "" };
    return acc;
  }, {});
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

function StoreSelector({
  stores,
  applyAll,
  setApplyAll,
  selectedIds,
  setSelectedIds,
  disabled = false,
}) {
  const onToggleStore = (id, checked) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(String(id));
      else set.delete(String(id));
      return Array.from(set);
    });
  };

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          disabled={disabled}
          checked={applyAll}
          onChange={(e) => setApplyAll(e.target.checked)}
        />
        Apply to all stores ({stores.length})
      </label>

      <div className="max-h-44 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
        {stores.map((s) => {
          const checked = applyAll || selectedIds.includes(String(s.id));
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
    </div>
  );
}

export default function CreateOfferPage() {
  const router = useRouter();

  const [loadingStores, setLoadingStores] = useState(true);
  const [savingStandard, setSavingStandard] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);

  const [applyAllStores, setApplyAllStores] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);

  const [visitApplyAllStores, setVisitApplyAllStores] = useState(false);
  const [visitSelectedStoreIds, setVisitSelectedStoreIds] = useState([]);

  const [title, setTitle] = useState("");
  const [discountType, setDiscountType] = useState("PERCENT");
  const [value, setValue] = useState("");
  const [minBill, setMinBill] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [stackable, setStackable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(
    TERMS.reduce((acc, t) => ({ ...acc, [t.id]: false }), {})
  );

  const [visitRewards, setVisitRewards] = useState(createDefaultVisitRewards);

  const allTermsAccepted = useMemo(
    () => TERMS.every((t) => acceptedTerms[t.id]),
    [acceptedTerms]
  );

  const effectiveStoreIds = useMemo(() => {
    if (applyAllStores) return stores.map((s) => String(s.id));
    return selectedStoreIds;
  }, [applyAllStores, stores, selectedStoreIds]);

  const effectiveVisitStoreIds = useMemo(() => {
    if (visitApplyAllStores) return stores.map((s) => String(s.id));
    return visitSelectedStoreIds;
  }, [visitApplyAllStores, stores, visitSelectedStoreIds]);

  const visitRewardRows = useMemo(() => {
    return VISIT_STEPS.map((visit) => {
      const row = visitRewards[String(visit)] || { mode: REWARD_MODES.NONE, amount: "", gift: "" };
      const mode = row.mode;

      if (mode === REWARD_MODES.NONE) return null;
      if (mode === REWARD_MODES.GIFT) {
        if (!row.gift.trim()) return { invalid: true };
        return {
          invalid: false,
          value: {
            visit_number: visit,
            reward_type: "GIFT",
            description: row.gift.trim(),
          },
        };
      }

      const amount = Number(row.amount || 0);
      const invalidPercent = mode === REWARD_MODES.PERCENT && (amount <= 0 || amount > 100);
      const invalidFlat = mode === REWARD_MODES.FLAT && amount <= 0;
      if (!Number.isFinite(amount) || invalidPercent || invalidFlat) return { invalid: true };

      return {
        invalid: false,
        value: {
          visit_number: visit,
          reward_type: mode === REWARD_MODES.PERCENT ? "PERCENT" : "FLAT",
          amount,
          currency: "MUR",
        },
      };
    }).filter(Boolean);
  }, [visitRewards]);

  const hasVisitConfig = useMemo(
    () => visitRewardRows.some((r) => r && !r.invalid),
    [visitRewardRows]
  );

  const visitHasInvalidRows = useMemo(
    () => visitRewardRows.some((r) => r?.invalid),
    [visitRewardRows]
  );

  const canSubmitStandard = useMemo(() => {
    if (!title.trim()) return false;
    if (!value || Number(value) <= 0) return false;
    if (!startAt || !endAt) return false;
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) return false;
    if (!effectiveStoreIds.length) return false;
    if (!allTermsAccepted) return false;
    return true;
  }, [title, value, startAt, endAt, effectiveStoreIds, allTermsAccepted]);

  const canSubmitVisit = useMemo(() => {
    if (!effectiveVisitStoreIds.length) return false;
    if (!hasVisitConfig) return false;
    if (visitHasInvalidRows) return false;
    return true;
  }, [effectiveVisitStoreIds, hasVisitConfig, visitHasInvalidRows]);

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
          .select("id,name,city,is_active,offers")
          .eq("owner_user_id", userId);

        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id (id,name,city,is_active,offers)")
          .eq("user_id", userId);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

        const mergedMap = new Map();
        [...ownerStores, ...memberStores].forEach((s) => {
          mergedMap.set(String(s.id), s);
        });

        const list = Array.from(mergedMap.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!cancelled) {
          setStores(list);
          if (list.length) {
            const first = String(list[0].id);
            setSelectedStoreIds([first]);
            setVisitSelectedStoreIds([first]);
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

  const buildStandardOfferPayload = () => {
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

  const buildVisitOfferPayload = () => {
    const visit_rewards = visitRewardRows
      .filter((r) => r && !r.invalid && r.value)
      .map((r) => r.value);

    return {
      id: uid(),
      type: "VISIT",
      visit_rewards,
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

  const upsertVisitOfferAndUpdateStore = async (store, visitOffer) => {
    const existing = Array.isArray(store.offers) ? store.offers : [];
    const nonVisit = existing.filter((o) => String(o?.type || "").toUpperCase() !== "VISIT");
    const nextOffers = [...nonVisit, visitOffer];

    const { error } = await supabaseBrowser
      .from("stores")
      .update({ offers: nextOffers })
      .eq("id", store.id);

    if (error) throw error;
  };

  const handleSubmitStandard = async () => {
    if (!canSubmitStandard || savingStandard) return;

    try {
      setSavingStandard(true);
      setErr("");
      setOk("");

      const offer = buildStandardOfferPayload();
      const targets = stores.filter((s) => effectiveStoreIds.includes(String(s.id)));

      if (!targets.length) throw new Error("No stores selected.");

      await Promise.all(targets.map((s) => appendOfferAndUpdateStore(s, offer)));

      setOk(`Standard offer created for ${targets.length} store(s).`);
      setTimeout(() => router.push("/store-partner/offers"), 800);
    } catch (e) {
      setErr(e?.message || "Failed to create offer.");
    } finally {
      setSavingStandard(false);
    }
  };

  const handleSubmitVisit = async () => {
    if (!canSubmitVisit || savingVisit) return;

    try {
      setSavingVisit(true);
      setErr("");
      setOk("");

      const visitOffer = buildVisitOfferPayload();
      const targets = stores.filter((s) => effectiveVisitStoreIds.includes(String(s.id)));

      if (!targets.length) throw new Error("No stores selected.");

      await Promise.all(targets.map((s) => upsertVisitOfferAndUpdateStore(s, visitOffer)));

      setOk(`Digital Loyalty Stamp saved for ${targets.length} store(s).`);
    } catch (e) {
      setErr(e?.message || "Failed to save Digital Loyalty Stamp.");
    } finally {
      setSavingVisit(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-4 space-y-6">
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
          <>
            <Card
              title="Create Standard Offer"
              subtitle="This is your regular offer with title, validity, and conditions."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Stores" required>
                  <StoreSelector
                    stores={stores}
                    applyAll={applyAllStores}
                    setApplyAll={setApplyAllStores}
                    selectedIds={selectedStoreIds}
                    setSelectedIds={setSelectedStoreIds}
                    disabled={savingStandard}
                  />
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
                  onClick={handleSubmitStandard}
                  disabled={!canSubmitStandard || savingStandard || loadingStores}
                  className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                  style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
                >
                  {savingStandard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                  Create Standard Offer
                </button>
              </div>
            </Card>

            <Card
              title="Digital Loyalty Stamp (rewards for repeat visits)"
              subtitle="Configure reward for repeat visits: flat discount, percent discount, or custom free gift/service."
            >
              <div className="grid grid-cols-1 gap-5">
                <Field label="Stores" required>
                  <StoreSelector
                    stores={stores}
                    applyAll={visitApplyAllStores}
                    setApplyAll={setVisitApplyAllStores}
                    selectedIds={visitSelectedStoreIds}
                    setSelectedIds={setVisitSelectedStoreIds}
                    disabled={savingVisit}
                  />
                </Field>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Visit Reward Builder</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Example: 10th visit → “Free shirt” or “100 MUR off” or “20% off bill”.
                  </div>

                  <div className="mt-4 space-y-3">
                    {VISIT_STEPS.map((visit) => {
                      const row = visitRewards[String(visit)];
                      const mode = row?.mode || REWARD_MODES.NONE;
                      const invalid =
                        (mode === REWARD_MODES.FLAT && Number(row.amount || 0) <= 0) ||
                        (mode === REWARD_MODES.PERCENT &&
                          (Number(row.amount || 0) <= 0 || Number(row.amount || 0) > 100)) ||
                        (mode === REWARD_MODES.GIFT && !String(row.gift || "").trim());

                      return (
                        <div
                          key={visit}
                          className="rounded-2xl border border-gray-200 bg-white p-3 grid grid-cols-1 md:grid-cols-12 gap-3"
                        >
                          <div className="md:col-span-2 flex items-center text-sm font-semibold text-gray-800">
                            {visit}th visit
                          </div>

                          <div className="md:col-span-3">
                            <select
                              value={mode}
                              onChange={(e) =>
                                setVisitRewards((prev) => ({
                                  ...prev,
                                  [String(visit)]: {
                                    ...prev[String(visit)],
                                    mode: e.target.value,
                                  },
                                }))
                              }
                              className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                            >
                              <option value={REWARD_MODES.NONE}>No reward</option>
                              <option value={REWARD_MODES.FLAT}>Flat amount off (MUR)</option>
                              <option value={REWARD_MODES.PERCENT}>Percent off bill (%)</option>
                              <option value={REWARD_MODES.GIFT}>Free gift / service</option>
                            </select>
                          </div>

                          {(mode === REWARD_MODES.FLAT || mode === REWARD_MODES.PERCENT) && (
                            <div className="md:col-span-3">
                              <input
                                type="number"
                                min="0"
                                max={mode === REWARD_MODES.PERCENT ? "100" : undefined}
                                value={row.amount}
                                onChange={(e) =>
                                  setVisitRewards((prev) => ({
                                    ...prev,
                                    [String(visit)]: {
                                      ...prev[String(visit)],
                                      amount: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={mode === REWARD_MODES.FLAT ? "e.g. 100" : "e.g. 20"}
                                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                              />
                            </div>
                          )}

                          {mode === REWARD_MODES.GIFT && (
                            <div className="md:col-span-5">
                              <input
                                value={row.gift}
                                onChange={(e) =>
                                  setVisitRewards((prev) => ({
                                    ...prev,
                                    [String(visit)]: {
                                      ...prev[String(visit)],
                                      gift: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="e.g. Free shirt / Free haircut / Free dessert"
                                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                              />
                            </div>
                          )}

                          {mode !== REWARD_MODES.NONE && invalid ? (
                            <div className="md:col-span-12 text-xs text-red-600">
                              {mode === REWARD_MODES.GIFT
                                ? "Enter reward text."
                                : mode === REWARD_MODES.PERCENT
                                ? "Enter a valid percent between 1 and 100."
                                : "Enter a valid flat discount amount."}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
                <button
                  type="button"
                  onClick={handleSubmitVisit}
                  disabled={!canSubmitVisit || savingVisit || loadingStores}
                  className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
                  style={{ background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)" }}
                >
                  {savingVisit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                  Save Digital Loyalty Stamp
                </button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
