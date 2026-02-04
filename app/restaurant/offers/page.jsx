"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* ----------------------------
   OFFERS (restaurant-level)
-----------------------------*/
const EMPTY_OFFER = () => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `off_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  title: "",
  promoCode: "",
  discountType: "PERCENT", // PERCENT | FLAT
  discountValue: "",
  startDate: "",
  endDate: "",
  isActive: true,
  conditions: {
    minGuests: "",
    minBillAmount: "",
    newUsersOnly: false,
    weekdaysOnly: false,
  },
});

function normalizeOffers(rawOffer) {
  if (!rawOffer) return [];
  if (Array.isArray(rawOffer)) return rawOffer;
  if (typeof rawOffer === "object") return [rawOffer];
  return [];
}

function sanitizeOffer(o) {
  const discountValue =
    o.discountValue === "" || o.discountValue == null ? "" : Number(o.discountValue);

  const minGuests =
    o.conditions?.minGuests === "" || o.conditions?.minGuests == null
      ? ""
      : Number(o.conditions.minGuests);

  const minBillAmount =
    o.conditions?.minBillAmount === "" || o.conditions?.minBillAmount == null
      ? ""
      : Number(o.conditions.minBillAmount);

  return {
    ...o,
    promoCode: (o.promoCode || "").toUpperCase(),
    discountValue,
    isActive: Boolean(o.isActive),
    conditions: {
      ...o.conditions,
      minGuests,
      minBillAmount,
      newUsersOnly: Boolean(o.conditions?.newUsersOnly),
      weekdaysOnly: Boolean(o.conditions?.weekdaysOnly),
    },
  };
}

function formatOfferLine(o) {
  const amt =
    o.discountType === "PERCENT"
      ? `${o.discountValue || 0}% OFF`
      : `₹${o.discountValue || 0} OFF`;

  const dates =
    o.startDate || o.endDate
      ? `Valid ${o.startDate || "—"} → ${o.endDate || "—"}`
      : "No validity dates";

  return `${amt} • ${dates}`;
}

/* ----------------------------
   DISH DISCOUNTS (menu-level)
   Stored inside menu JSONB, per item:
   - discount_percent
   - discounted_price
   - discount_active (true/false)
-----------------------------*/
function calcDiscountedPrice(price, percent) {
  const p = Number(percent);
  const pr = Number(price);
  if (!Number.isFinite(pr) || !Number.isFinite(p)) return "";
  return Math.round(pr - (pr * p) / 100);
}

function ensureDishDiscountFields(item) {
  // If discount_percent exists but discount_active missing, default to true
  if (item && item.discount_percent != null && typeof item.discount_active !== "boolean") {
    return { ...item, discount_active: true };
  }
  return item;
}

/* ----------------------------
   SKELETON (loading state)
-----------------------------*/
function Skeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* top strip */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-7 w-40 rounded bg-slate-200" />
            <div className="h-4 w-72 rounded bg-slate-200" />
            <div className="h-10 w-40 rounded bg-slate-200 mt-4" />
          </div>
        </div>

        {/* offers list */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-16 rounded bg-slate-200 animate-pulse" />
          </div>

          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="animate-pulse">
                <div className="h-5 w-64 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-80 rounded bg-slate-200" />
                <div className="mt-3 flex gap-2">
                  <div className="h-8 w-24 rounded bg-slate-200" />
                  <div className="h-8 w-20 rounded bg-slate-200" />
                  <div className="h-8 w-20 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* dish discounts */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="space-y-2 animate-pulse">
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-3 w-64 rounded bg-slate-200" />
            </div>
            <div className="flex gap-2">
              <div className="h-7 w-20 rounded-full bg-slate-200 animate-pulse" />
              <div className="h-7 w-28 rounded-full bg-slate-200 animate-pulse" />
              <div className="h-7 w-24 rounded-full bg-slate-200 animate-pulse" />
            </div>
          </div>

          <div className="p-6 space-y-6">
            {Array.from({ length: 2 }).map((_, s) => (
              <div key={s} className="space-y-3">
                <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
                {Array.from({ length: 3 }).map((__, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="animate-pulse">
                      <div className="h-4 w-56 rounded bg-slate-200" />
                      <div className="mt-2 h-3 w-40 rounded bg-slate-200" />
                      <div className="mt-3 flex gap-2">
                        <div className="h-8 w-24 rounded bg-slate-200" />
                        <div className="h-8 w-24 rounded bg-slate-200" />
                        <div className="h-8 w-20 rounded bg-slate-200" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* floating button */}
      <div className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-slate-200 animate-pulse shadow-lg" />
    </div>
  );
}

export default function OffersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [restaurantId, setRestaurantId] = useState(null);
  const [menu, setMenu] = useState(null);

  // restaurants.offer (array)
  const [offers, setOffers] = useState([]);

  // Offer Modal
  const [openModal, setOpenModal] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [formOffer, setFormOffer] = useState(EMPTY_OFFER());

  const [lastError, setLastError] = useState("");

  /* -------------------------------------------
     LOAD DATA
  ------------------------------------------- */
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    setLastError("");

    const {
      data: { user },
    } = await supabaseBrowser.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabaseBrowser
      .from("restaurants")
      .select("id, menu, offer")
      .eq("owner_user_id", user.id)
      .single();

    if (error) {
      console.error("loadData error:", error);
      setLastError(error.message || "Failed to load data");
      setLoading(false);
      return;
    }

    if (data) {
      setRestaurantId(data.id);

      const m = structuredClone(data.menu);
      if (m?.sections?.length) {
        for (const s of m.sections) {
          s.items = (s.items || []).map(ensureDishDiscountFields);
        }
      }
      setMenu(m);

      const normalizedOffers = normalizeOffers(data.offer).map((o) => ({
        ...o,
        id:
          o.id ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `off_${Date.now()}_${Math.random().toString(16).slice(2)}`),
        isActive: typeof o.isActive === "boolean" ? o.isActive : true,
        promoCode: (o.promoCode || "").toUpperCase(),
        conditions: {
          minGuests: o.conditions?.minGuests ?? "",
          minBillAmount: o.conditions?.minBillAmount ?? "",
          newUsersOnly: Boolean(o.conditions?.newUsersOnly),
          weekdaysOnly: Boolean(o.conditions?.weekdaysOnly),
        },
      }));

      setOffers(normalizedOffers);
    }

    setLoading(false);
  }

  /* -------------------------------------------
     DISH DISCOUNTS (show ALL dishes + edit + active/inactive)
     NOTE: since you removed "Save changes", we save menu immediately here.
  ------------------------------------------- */
  async function saveMenuOnly(nextMenu) {
    if (!restaurantId) return false;

    setSaving(true);
    setLastError("");

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ menu: nextMenu })
      .eq("id", restaurantId);

    if (error) {
      console.error("saveMenuOnly error:", error);
      setLastError(error.message || "Failed to save menu changes");
      setSaving(false);
      return false;
    }

    setSaving(false);
    return true;
  }

  async function setDishPercent(sIndex, iIndex, percentStr) {
    const updated = structuredClone(menu);
    const item = updated.sections[sIndex].items[iIndex];

    if (percentStr === "" || percentStr == null) {
      delete item.discount_percent;
      delete item.discounted_price;
      delete item.discount_active;
      updated.sections[sIndex].items[iIndex] = item;

      setMenu(updated);
      await saveMenuOnly(updated);
      return;
    }

    const p = Number(percentStr);
    if (!Number.isFinite(p) || p < 0 || p > 100) return;

    item.discount_percent = p;
    item.discount_active =
      typeof item.discount_active === "boolean" ? item.discount_active : true;
    item.discounted_price = calcDiscountedPrice(item.price, p);

    updated.sections[sIndex].items[iIndex] = item;

    setMenu(updated);
    await saveMenuOnly(updated);
  }

  async function toggleDishDiscountActive(sIndex, iIndex) {
    const updated = structuredClone(menu);
    const item = updated.sections[sIndex].items[iIndex];

    if (item.discount_percent == null || item.discount_percent === "") return;

    item.discount_active = !Boolean(item.discount_active);
    updated.sections[sIndex].items[iIndex] = item;

    setMenu(updated);
    await saveMenuOnly(updated);
  }

  async function clearDishDiscount(sIndex, iIndex) {
    const updated = structuredClone(menu);
    const item = updated.sections[sIndex].items[iIndex];

    delete item.discount_percent;
    delete item.discounted_price;
    delete item.discount_active;

    updated.sections[sIndex].items[iIndex] = item;

    setMenu(updated);
    await saveMenuOnly(updated);
  }

  /* -------------------------------------------
     OFFERS: SAVE IMMEDIATELY FROM MODAL
  ------------------------------------------- */
  async function saveOffersOnly(nextOffers) {
    if (!restaurantId) return false;

    setSaving(true);
    setLastError("");

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ offer: nextOffers.map(sanitizeOffer) })
      .eq("id", restaurantId);

    if (error) {
      console.error("saveOffersOnly error:", error);
      setLastError(error.message || "Failed to save offers");
      setSaving(false);
      return false;
    }

    setSaving(false);
    await loadData();
    return true;
  }

  function openCreate() {
    setEditingOfferId(null);
    setFormOffer(EMPTY_OFFER());
    setOpenModal(true);
  }

  function openEdit(id) {
    const found = offers.find((o) => o.id === id);
    if (!found) return;

    setEditingOfferId(id);
    setFormOffer({
      ...found,
      discountValue: found.discountValue ?? "",
      conditions: {
        minGuests: found.conditions?.minGuests ?? "",
        minBillAmount: found.conditions?.minBillAmount ?? "",
        newUsersOnly: Boolean(found.conditions?.newUsersOnly),
        weekdaysOnly: Boolean(found.conditions?.weekdaysOnly),
      },
    });

    setOpenModal(true);
  }

  async function upsertOfferToList() {
    const cleaned = sanitizeOffer(formOffer);

    if (!cleaned.title?.trim()) return alert("Please enter an offer title.");
    if (!cleaned.promoCode?.trim()) return alert("Please enter a promo code.");
    if (cleaned.discountValue === "" || Number.isNaN(Number(cleaned.discountValue))) {
      return alert("Please enter a valid discount value.");
    }

    const next = (() => {
      const exists = offers.some((o) => o.id === cleaned.id);
      if (exists) return offers.map((o) => (o.id === cleaned.id ? cleaned : o));
      return [cleaned, ...offers];
    })();

    setOffers(next);

    const ok = await saveOffersOnly(next);
    if (ok) setOpenModal(false);
  }

  async function removeOffer(id) {
    const ok = confirm("Delete this offer?");
    if (!ok) return;

    const next = offers.filter((o) => o.id !== id);
    setOffers(next);
    await saveOffersOnly(next);
  }

  async function toggleOfferActive(id) {
    const next = offers.map((o) => (o.id === id ? { ...o, isActive: !o.isActive } : o));
    setOffers(next);
    await saveOffersOnly(next);
  }

  /* -------------------------------------------
     DERIVED
  ------------------------------------------- */
  const activeOffers = useMemo(() => offers.filter((o) => o.isActive), [offers]);

  const dishStats = useMemo(() => {
    if (!menu?.sections?.length) return { total: 0, discounted: 0, active: 0 };
    let total = 0;
    let discounted = 0;
    let active = 0;

    for (const s of menu.sections) {
      for (const i of s.items || []) {
        total += 1;
        if (i.discount_percent != null && i.discount_percent !== "") {
          discounted += 1;
          if (i.discount_active !== false) active += 1;
        }
      }
    }
    return { total, discounted, active };
  }, [menu]);

  /* -------------------------------------------
     UI
  ------------------------------------------- */
  if (loading) return <Skeleton />;

  if (!menu) {
    return <div className="p-6 text-sm text-slate-500">No menu found.</div>;
  }

  return (
    <div className="min-h-screen">
      {/* ERROR STRIP */}
      {lastError ? (
        <div className="max-w-6xl mx-auto px-6 pt-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {lastError}
          </div>
        </div>
      ) : null}

      {/* SAVING INDICATOR */}
      {saving ? (
        <div className="fixed top-4 right-4 z-[80] rounded-xl bg-slate-900 text-white px-4 py-2 text-sm shadow-lg">
          Saving…
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ACTIVE SUMMARY STRIP */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Running offers</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {activeOffers.length} active
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Offers are saved instantly from the modal.
              </p>
            </div>

            <button
              onClick={openCreate}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              + Create new offer
            </button>
          </div>
        </div>

        {/* OFFERS LIST */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">All offers</p>
            <p className="text-xs text-slate-500">{offers.length} total</p>
          </div>

          {offers.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              No offers yet. Click <b>Create new offer</b> to add one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {offers.map((o) => (
                <div
                  key={o.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {o.title}
                      </span>

                      <span className="text-xs font-mono rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                        {o.promoCode}
                      </span>

                      {o.isActive ? (
                        <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                          Inactive
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-1">{formatOfferLine(o)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleOfferActive(o.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {o.isActive ? "Deactivate" : "Activate"}
                    </button>

                    <button
                      onClick={() => openEdit(o.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => removeOffer(o.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DISH DISCOUNTS (ALL DISHES) */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">Dish discounts</p>
              <p className="text-xs text-slate-500 mt-1">
                Changes here are saved instantly (no Save button).
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                Total: {dishStats.total}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Discounted: {dishStats.discounted}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Active: {dishStats.active}
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {(menu.sections || []).map((section, sIndex) => (
              <div key={section.id} className="px-6 py-5">
                <p className="text-sm font-semibold text-slate-900">{section.name}</p>

                <div className="mt-4 space-y-3">
                  {(section.items || []).map((item, iIndex) => {
                    const hasDiscount =
                      item.discount_percent != null && item.discount_percent !== "";
                    const active = hasDiscount ? item.discount_active !== false : false;

                    return (
                      <div
                        key={`${section.id}-${item.id}`}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Price: ₹{item.price}
                              {hasDiscount ? (
                                <>
                                  {" "}
                                  • Discounted:{" "}
                                  <span className="text-slate-700 font-medium">
                                    ₹{item.discounted_price}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {hasDiscount ? (
                              active ? (
                                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                                  Active {item.discount_percent}% OFF
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                                  Inactive {item.discount_percent}% OFF
                                </span>
                              )
                            ) : (
                              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                                No discount
                              </span>
                            )}

                            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                              <span className="text-xs text-slate-600">%</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                placeholder="0"
                                value={hasDiscount ? item.discount_percent : ""}
                                onChange={(e) => setDishPercent(sIndex, iIndex, e.target.value)}
                                className="w-20 bg-transparent text-sm outline-none"
                              />
                            </div>

                            <button
                              type="button"
                              disabled={!hasDiscount}
                              onClick={() => toggleDishDiscountActive(sIndex, iIndex)}
                              className={`rounded-lg px-3 py-2 text-xs border ${
                                hasDiscount
                                  ? active
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  : "border-slate-200 bg-white text-slate-400 cursor-not-allowed"
                              }`}
                            >
                              {hasDiscount ? (active ? "Deactivate" : "Activate") : "Activate"}
                            </button>

                            <button
                              type="button"
                              disabled={!hasDiscount}
                              onClick={() => clearDishDiscount(sIndex, iIndex)}
                              className={`rounded-lg px-3 py-2 text-xs border ${
                                hasDiscount
                                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : "border-slate-200 bg-white text-slate-400 cursor-not-allowed"
                              }`}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FLOATING + BUTTON */}
      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#DA3224] text-white text-3xl flex items-center justify-center shadow-lg hover:opacity-95 active:scale-95 transition"
        title="Create new offer"
      >
        +
      </button>

      {/* OFFER MODAL */}
      {openModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenModal(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {editingOfferId ? "Edit offer" : "Create offer"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Clicking “Add offer” saves immediately.
                </p>
              </div>

              <button
                onClick={() => setOpenModal(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-2">Offer title</p>
                  <input
                    placeholder="e.g. Weekend Special"
                    value={formOffer.title}
                    onChange={(e) => setFormOffer({ ...formOffer, title: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2">Promo code</p>
                  <input
                    placeholder="e.g. WEEKEND20"
                    value={formOffer.promoCode}
                    onChange={(e) =>
                      setFormOffer({ ...formOffer, promoCode: e.target.value.toUpperCase() })
                    }
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-2">Discount type</p>
                  <select
                    value={formOffer.discountType}
                    onChange={(e) => setFormOffer({ ...formOffer, discountType: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="PERCENT">Percentage</option>
                    <option value="FLAT">Flat amount</option>
                  </select>
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2">
                    {formOffer.discountType === "PERCENT" ? "% OFF" : "₹ OFF"}
                  </p>
                  <input
                    type="number"
                    placeholder={formOffer.discountType === "PERCENT" ? "20" : "200"}
                    value={formOffer.discountValue}
                    onChange={(e) => setFormOffer({ ...formOffer, discountValue: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 w-full">
                    <input
                      type="checkbox"
                      checked={Boolean(formOffer.isActive)}
                      onChange={(e) => setFormOffer({ ...formOffer, isActive: e.target.checked })}
                    />
                    <span className="text-sm text-slate-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-2">Start date</p>
                  <input
                    type="date"
                    value={formOffer.startDate}
                    onChange={(e) => setFormOffer({ ...formOffer, startDate: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2">End date</p>
                  <input
                    type="date"
                    value={formOffer.endDate}
                    onChange={(e) => setFormOffer({ ...formOffer, endDate: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                <p className="text-sm font-semibold text-slate-900">Conditions</p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Minimum guests</span>
                      <input
                        type="number"
                        placeholder="e.g. 4"
                        value={formOffer.conditions.minGuests ?? ""}
                        onChange={(e) =>
                          setFormOffer({
                            ...formOffer,
                            conditions: { ...formOffer.conditions, minGuests: e.target.value },
                          })
                        }
                        className="w-24 rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Minimum bill amount</span>
                      <input
                        type="number"
                        placeholder="e.g. 500"
                        value={formOffer.conditions.minBillAmount ?? ""}
                        onChange={(e) =>
                          setFormOffer({
                            ...formOffer,
                            conditions: { ...formOffer.conditions, minBillAmount: e.target.value },
                          })
                        }
                        className="w-24 rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(formOffer.conditions.newUsersOnly)}
                      onChange={(e) =>
                        setFormOffer({
                          ...formOffer,
                          conditions: { ...formOffer.conditions, newUsersOnly: e.target.checked },
                        })
                      }
                    />
                    <span className="text-sm text-slate-700">New users only</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(formOffer.conditions.weekdaysOnly)}
                      onChange={(e) =>
                        setFormOffer({
                          ...formOffer,
                          conditions: { ...formOffer.conditions, weekdaysOnly: e.target.checked },
                        })
                      }
                    />
                    <span className="text-sm text-slate-700">Weekdays only</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setOpenModal(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                onClick={upsertOfferToList}
                disabled={saving}
                className="rounded-xl bg-[#DA3224] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingOfferId ? "Update offer" : "Add offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
