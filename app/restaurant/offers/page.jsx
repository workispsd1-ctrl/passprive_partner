"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* ----------------------------
   OFFER TYPES
-----------------------------*/
const OFFER_KIND = {
  GENERAL: "GENERAL",
  TIME_SLOT: "TIME_SLOT",
  VISIT: "VISIT",
  DISH: "DISH",
};

const WEEK_DAYS = [
  { key: "MON", label: "Mon" },
  { key: "TUE", label: "Tue" },
  { key: "WED", label: "Wed" },
  { key: "THU", label: "Thu" },
  { key: "FRI", label: "Fri" },
  { key: "SAT", label: "Sat" },
  { key: "SUN", label: "Sun" },
];

const DEMO_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12/34",
  cvv: "123",
};

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* ----------------------------
   CARD HELPERS (FIXED)
-----------------------------*/
function normalizeCardNumber(v) {
  return String(v || "").replace(/\D/g, "");
}

function formatCardNumber(v) {
  const digits = normalizeCardNumber(v).slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v) {
  const digits = String(v || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCvv(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 4);
}

/* ----------------------------
   DEFAULT / EMPTY MODELS
-----------------------------*/
const EMPTY_TIER = () => ({
  id: uid(),
  visitCount: "",
  rewardType: "FREE_ITEM",
  rewardLabel: "",
  rewardValue: "",
});

const EMPTY_OFFER = (kind = OFFER_KIND.GENERAL) => ({
  id: uid(),
  offerKind: kind,

  title: "",
  promoCode: "",

  discountType: "PERCENT",
  discountValue: "",

  startDate: "",
  endDate: "",

  slotStart: "",
  slotEnd: "",
  weekdays: [],

  isActive: true,

  conditions: {
    minGuests: "",
    minBillAmount: "",
    newUsersOnly: false,
  },

  visitRewards: {
    enabled: kind === OFFER_KIND.VISIT,
    tiers: [EMPTY_TIER()],
  },

  dishDiscount: {
    dishId: "",
    dishName: "",
    sectionId: "",
    sectionName: "",
  },
});

/* ----------------------------
   NORMALIZERS / SANITIZERS
-----------------------------*/
function normalizeOffers(rawOffer) {
  if (!rawOffer) return [];
  if (Array.isArray(rawOffer)) return rawOffer;
  if (typeof rawOffer === "object") return [rawOffer];
  return [];
}

function inferKind(o) {
  if (o?.offerKind && Object.values(OFFER_KIND).includes(o.offerKind)) return o.offerKind;
  if (o?.visitRewards?.enabled) return OFFER_KIND.VISIT;
  if (o?.dishDiscount?.dishId || o?.dishId) return OFFER_KIND.DISH;
  if (o?.slotStart || o?.slotEnd || (Array.isArray(o?.weekdays) && o.weekdays.length > 0))
    return OFFER_KIND.TIME_SLOT;
  return OFFER_KIND.GENERAL;
}

function normalizeTier(t) {
  return {
    id: t?.id || uid(),
    visitCount: t?.visitCount ?? "",
    rewardType: t?.rewardType || "FREE_ITEM",
    rewardLabel: t?.rewardLabel || "",
    rewardValue: t?.rewardValue ?? "",
  };
}

function sanitizeTier(t) {
  const visitCount = Number(t.visitCount);
  const rewardValue =
    t.rewardValue === "" || t.rewardValue == null ? "" : Number(t.rewardValue);

  return {
    id: t.id || uid(),
    visitCount: Number.isFinite(visitCount) ? Math.max(1, Math.min(10, visitCount)) : "",
    rewardType: t.rewardType || "FREE_ITEM",
    rewardLabel: String(t.rewardLabel || "").trim(),
    rewardValue,
  };
}

function sanitizeOffer(o) {
  const kind = inferKind(o);

  if (kind === OFFER_KIND.VISIT) {
    const rawTiers = Array.isArray(o?.visitRewards?.tiers) ? o.visitRewards.tiers : [];
    const tiers = rawTiers.map(sanitizeTier);

    return {
      id: o.id || uid(),
      offerKind: OFFER_KIND.VISIT,
      visitRewards: { enabled: true, tiers },
      isActive: true,
      title: "",
      promoCode: "",
      discountType: "",
      discountValue: "",
      startDate: "",
      endDate: "",
      slotStart: "",
      slotEnd: "",
      weekdays: [],
      conditions: null,
      dishDiscount: null,
    };
  }

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

  if (kind === OFFER_KIND.DISH) {
    return {
      id: o.id || uid(),
      offerKind: OFFER_KIND.DISH,
      title: String(o.title || "").trim(),
      promoCode: String(o.promoCode || "").toUpperCase(),
      discountType: o.discountType || "PERCENT",
      discountValue,
      startDate: o.startDate || "",
      endDate: o.endDate || "",
      isActive: Boolean(o.isActive),
      dishDiscount: {
        dishId: o?.dishDiscount?.dishId || o?.dishId || "",
        dishName: o?.dishDiscount?.dishName || o?.dishName || "",
        sectionId: o?.dishDiscount?.sectionId || "",
        sectionName: o?.dishDiscount?.sectionName || "",
      },
      slotStart: "",
      slotEnd: "",
      weekdays: [],
      conditions: null,
      visitRewards: { enabled: false, tiers: [] },
    };
  }

  return {
    ...o,
    offerKind: kind,
    promoCode: String(o.promoCode || "").toUpperCase(),
    discountValue,
    isActive: Boolean(o.isActive),
    weekdays: Array.isArray(o.weekdays) ? o.weekdays : [],
    conditions: {
      ...o.conditions,
      minGuests,
      minBillAmount,
      newUsersOnly: Boolean(o.conditions?.newUsersOnly),
    },
    visitRewards: { enabled: false, tiers: [] },
    dishDiscount: null,
  };
}

function normalizeOneOffer(o) {
  const offerKind = inferKind(o);

  if (offerKind === OFFER_KIND.VISIT) {
    const tiers = Array.isArray(o?.visitRewards?.tiers)
      ? o.visitRewards.tiers.map(normalizeTier)
      : [EMPTY_TIER()];

    return {
      id: o.id || uid(),
      offerKind: OFFER_KIND.VISIT,
      title: "",
      promoCode: "",
      discountType: "",
      discountValue: "",
      startDate: "",
      endDate: "",
      slotStart: "",
      slotEnd: "",
      weekdays: [],
      isActive: true,
      conditions: null,
      visitRewards: { enabled: true, tiers },
      dishDiscount: { dishId: "", dishName: "", sectionId: "", sectionName: "" },
    };
  }

  if (offerKind === OFFER_KIND.DISH) {
    return {
      id: o.id || uid(),
      offerKind: OFFER_KIND.DISH,
      title: o.title || "",
      promoCode: (o.promoCode || "").toUpperCase(),
      discountType: o.discountType || "PERCENT",
      discountValue: o.discountValue ?? "",
      startDate: o.startDate || "",
      endDate: o.endDate || "",
      slotStart: "",
      slotEnd: "",
      weekdays: [],
      isActive: typeof o.isActive === "boolean" ? o.isActive : true,
      conditions: null,
      visitRewards: { enabled: false, tiers: [] },
      dishDiscount: {
        dishId: o?.dishDiscount?.dishId || o?.dishId || "",
        dishName: o?.dishDiscount?.dishName || o?.dishName || "",
        sectionId: o?.dishDiscount?.sectionId || "",
        sectionName: o?.dishDiscount?.sectionName || "",
      },
    };
  }

  return {
    id: o.id || uid(),
    offerKind,
    title: o.title || "",
    promoCode: (o.promoCode || "").toUpperCase(),
    discountType: o.discountType || "PERCENT",
    discountValue: o.discountValue ?? "",
    startDate: o.startDate || "",
    endDate: o.endDate || "",
    slotStart: o.slotStart || "",
    slotEnd: o.slotEnd || "",
    weekdays: Array.isArray(o.weekdays) ? o.weekdays : [],
    isActive: typeof o.isActive === "boolean" ? o.isActive : true,
    conditions: {
      minGuests: o.conditions?.minGuests ?? "",
      minBillAmount: o.conditions?.minBillAmount ?? "",
      newUsersOnly: Boolean(o.conditions?.newUsersOnly),
    },
    visitRewards: { enabled: false, tiers: [] },
    dishDiscount: { dishId: "", dishName: "", sectionId: "", sectionName: "" },
  };
}

/* ----------------------------
   FORMATTERS
-----------------------------*/
function formatWeekdays(days) {
  if (!Array.isArray(days) || !days.length) return "All days";
  return days.join(", ");
}

function formatVisitRewards(offer) {
  if (!offer?.visitRewards?.enabled) return "No visit rewards";
  const tiers = Array.isArray(offer.visitRewards.tiers) ? offer.visitRewards.tiers : [];
  if (!tiers.length) return "No tiers";

  const sorted = [...tiers]
    .filter((t) => Number(t.visitCount) >= 1 && Number(t.visitCount) <= 10)
    .sort((a, b) => Number(a.visitCount) - Number(b.visitCount));

  if (!sorted.length) return "No valid tiers";

  return sorted
    .map((t) => {
      if (t.rewardType === "FREE_ITEM") return `V${t.visitCount}: ${t.rewardLabel || "Free item"}`;
      if (t.rewardType === "PERCENT") return `V${t.visitCount}: ${t.rewardValue || 0}% OFF`;
      return `V${t.visitCount}: Rs ${t.rewardValue || 0} OFF`;
    })
    .join(" • ");
}

function formatOfferLine(o) {
  if (o.offerKind === OFFER_KIND.VISIT) return formatVisitRewards(o);

  const amt =
    o.discountType === "PERCENT"
      ? `${o.discountValue || 0}% OFF`
      : `Rs ${o.discountValue || 0} OFF`;

  const datePart =
    o.startDate || o.endDate ? `Valid ${o.startDate || "-"} -> ${o.endDate || "-"}` : "No date range";

  if (o.offerKind === OFFER_KIND.TIME_SLOT) {
    const slotPart = o.slotStart && o.slotEnd ? `${o.slotStart} - ${o.slotEnd}` : "No time slot";
    const dayPart = formatWeekdays(o.weekdays);
    return `${amt} • ${datePart} • ${dayPart} • ${slotPart}`;
  }

  if (o.offerKind === OFFER_KIND.DISH) {
    const dishName = o?.dishDiscount?.dishName || "Selected dish";
    return `${dishName} • ${amt} • ${datePart}`;
  }

  return `${amt} • ${datePart}`;
}

/* ----------------------------
   SKELETON
-----------------------------*/
function Skeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
              <div className="h-9 w-36 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="p-6 space-y-4">
              {Array.from({ length: 2 }).map((__, idx) => (
                <div key={idx} className="animate-pulse">
                  <div className="h-5 w-64 rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-[28rem] rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------
   PAGE
-----------------------------*/
export default function OffersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [restaurantId, setRestaurantId] = useState(null);
  const [offers, setOffers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  const [isSubscribed, setIsSubscribed] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [formOffer, setFormOffer] = useState(EMPTY_OFFER());

  const [openPaymentModal, setOpenPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [lastError, setLastError] = useState("");

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
      .select("id, offer, menu, subscribed")
      .eq("owner_user_id", user.id)
      .single();

    if (error) {
      setLastError(error.message || "Failed to load offers");
      setLoading(false);
      return;
    }

    if (data) {
      setRestaurantId(data.id);
      setOffers(normalizeOffers(data.offer).map(normalizeOneOffer));
      setIsSubscribed(Boolean(data.subscribed));

      const sections = Array.isArray(data?.menu?.sections) ? data.menu.sections : [];
      const items = [];
      sections.forEach((s) => {
        (Array.isArray(s?.items) ? s.items : []).forEach((i) => {
          items.push({
            sectionId: s.id || "",
            sectionName: s.name || "",
            dishId: i.id || "",
            dishName: i.name || "",
          });
        });
      });
      setMenuItems(items);
    }

    setLoading(false);
  }

  async function saveOffersOnly(nextOffers) {
    if (!restaurantId) return false;

    setSaving(true);
    setLastError("");

    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ offer: nextOffers.map(sanitizeOffer) })
      .eq("id", restaurantId);

    if (error) {
      setLastError(error.message || "Failed to save offers");
      setSaving(false);
      return false;
    }

    setSaving(false);
    await loadData();
    return true;
  }

  async function activatePremiumSubscription() {
    if (!restaurantId) return false;
    const { error } = await supabaseBrowser
      .from("restaurants")
      .update({ subscribed: true })
      .eq("id", restaurantId);

    if (error) {
      setPaymentError(error.message || "Failed to activate premium.");
      return false;
    }

    setIsSubscribed(true);
    return true;
  }

  function openPayment() {
    setPaymentError("");
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setOpenPaymentModal(true);
  }

  async function onPayAndUnlock() {
    setPaymentError("");

    const isDemoNumber = normalizeCardNumber(cardNumber) === normalizeCardNumber(DEMO_CARD.number);
    const isDemoExpiry = cardExpiry === DEMO_CARD.expiry;
    const isDemoCvv = cardCvv === DEMO_CARD.cvv;

    if (!cardName.trim()) {
      setPaymentError("Enter cardholder name.");
      return;
    }
    if (!isDemoNumber || !isDemoExpiry || !isDemoCvv) {
      setPaymentError("Use demo card details exactly to unlock premium.");
      return;
    }

    setPaying(true);
    await new Promise((r) => setTimeout(r, 900));
    const ok = await activatePremiumSubscription();
    setPaying(false);

    if (ok) {
      setOpenPaymentModal(false);
      await loadData();
    }
  }

  function ensurePremium(kind) {
    if (kind === OFFER_KIND.GENERAL) return true;
    if (!isSubscribed) {
      openPayment();
      return false;
    }
    return true;
  }

  function openCreate(kind = OFFER_KIND.GENERAL) {
    if (!ensurePremium(kind)) return;
    setEditingOfferId(null);
    setFormOffer(EMPTY_OFFER(kind));
    setOpenModal(true);
  }

  function openEdit(id) {
    const found = offers.find((o) => o.id === id);
    if (!found) return;

    const kind = found.offerKind || inferKind(found);
    if (!ensurePremium(kind)) return;

    setEditingOfferId(id);

    if (kind === OFFER_KIND.VISIT) {
      setFormOffer({
        ...EMPTY_OFFER(OFFER_KIND.VISIT),
        ...found,
        offerKind: OFFER_KIND.VISIT,
        title: "",
        promoCode: "",
        startDate: "",
        endDate: "",
        isActive: true,
        conditions: null,
        visitRewards: {
          enabled: true,
          tiers: Array.isArray(found?.visitRewards?.tiers)
            ? found.visitRewards.tiers.map(normalizeTier)
            : [EMPTY_TIER()],
        },
      });
      setOpenModal(true);
      return;
    }

    setFormOffer({
      ...EMPTY_OFFER(kind),
      ...found,
      conditions: {
        minGuests: found.conditions?.minGuests ?? "",
        minBillAmount: found.conditions?.minBillAmount ?? "",
        newUsersOnly: Boolean(found.conditions?.newUsersOnly),
      },
      visitRewards: {
        enabled: Boolean(found?.visitRewards?.enabled),
        tiers: Array.isArray(found?.visitRewards?.tiers)
          ? found.visitRewards.tiers.map(normalizeTier)
          : [EMPTY_TIER()],
      },
      dishDiscount: {
        dishId: found?.dishDiscount?.dishId || "",
        dishName: found?.dishDiscount?.dishName || "",
        sectionId: found?.dishDiscount?.sectionId || "",
        sectionName: found?.dishDiscount?.sectionName || "",
      },
    });
    setOpenModal(true);
  }

  function toggleDay(dayKey) {
    setFormOffer((prev) => {
      const has = prev.weekdays.includes(dayKey);
      return {
        ...prev,
        weekdays: has ? prev.weekdays.filter((d) => d !== dayKey) : [...prev.weekdays, dayKey],
      };
    });
  }

  function addVisitTier() {
    setFormOffer((prev) => ({
      ...prev,
      visitRewards: {
        ...prev.visitRewards,
        tiers: [...(prev.visitRewards?.tiers || []), EMPTY_TIER()],
      },
    }));
  }

  function removeVisitTier(id) {
    setFormOffer((prev) => {
      const next = (prev.visitRewards?.tiers || []).filter((t) => t.id !== id);
      return {
        ...prev,
        visitRewards: {
          ...prev.visitRewards,
          tiers: next.length ? next : [EMPTY_TIER()],
        },
      };
    });
  }

  function patchVisitTier(id, patch) {
    setFormOffer((prev) => ({
      ...prev,
      visitRewards: {
        ...prev.visitRewards,
        tiers: (prev.visitRewards?.tiers || []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      },
    }));
  }

  async function upsertOfferToList() {
    const cleaned = sanitizeOffer(formOffer);
    const kind = cleaned.offerKind || inferKind(cleaned) || OFFER_KIND.GENERAL;

    if (!ensurePremium(kind)) return;

    if (kind === OFFER_KIND.VISIT) {
      const tiers = Array.isArray(cleaned.visitRewards?.tiers) ? cleaned.visitRewards.tiers : [];
      if (!tiers.length) return alert("Add at least one visit reward tier.");

      const seen = new Set();
      for (const t of tiers) {
        const vc = Number(t.visitCount);
        if (!Number.isFinite(vc) || vc < 1 || vc > 10) {
          return alert("Visit count must be between 1 and 10.");
        }
        if (seen.has(vc)) {
          return alert(`Duplicate visit number ${vc}. Each visit milestone must be unique.`);
        }
        seen.add(vc);

        if (t.rewardType === "FREE_ITEM" && !String(t.rewardLabel || "").trim()) {
          return alert(`Enter free item name for visit ${vc}.`);
        }
        if (
          (t.rewardType === "PERCENT" || t.rewardType === "FLAT") &&
          (!Number.isFinite(Number(t.rewardValue)) || Number(t.rewardValue) <= 0)
        ) {
          return alert(`Enter valid reward value for visit ${vc}.`);
        }
      }

      cleaned.visitRewards.enabled = true;

      const next = (() => {
        const exists = offers.some((o) => o.id === cleaned.id);
        if (exists) return offers.map((o) => (o.id === cleaned.id ? cleaned : o));
        return [cleaned, ...offers];
      })();

      setOffers(next);
      const ok = await saveOffersOnly(next);
      if (ok) setOpenModal(false);
      return;
    }

    if (kind === OFFER_KIND.DISH) {
      if (!cleaned.dishDiscount?.dishId || !cleaned.dishDiscount?.dishName) {
        return alert("Please select a dish.");
      }
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
      return;
    }

    if (!cleaned.title?.trim()) return alert("Please enter an offer title.");
    if (!cleaned.promoCode?.trim()) return alert("Please enter a promo code.");
    if (cleaned.discountValue === "" || Number.isNaN(Number(cleaned.discountValue))) {
      return alert("Please enter a valid discount value.");
    }

    if (kind === OFFER_KIND.TIME_SLOT) {
      if (!cleaned.slotStart || !cleaned.slotEnd) {
        return alert("Please select slot start and end time.");
      }
      if (cleaned.weekdays.length === 0) {
        return alert("Please select at least one day.");
      }
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
    if (!confirm("Delete this offer?")) return;
    const target = offers.find((o) => o.id === id);
    if (!target) return;
    if (!ensurePremium(target.offerKind || inferKind(target))) return;

    const next = offers.filter((o) => o.id !== id);
    setOffers(next);
    await saveOffersOnly(next);
  }

  async function toggleOfferActive(id) {
    const target = offers.find((o) => o.id === id);
    if (!target) return;
    if (!ensurePremium(target.offerKind || inferKind(target))) return;

    if ((target.offerKind || inferKind(target)) === OFFER_KIND.VISIT) return;

    const next = offers.map((o) => (o.id === id ? { ...o, isActive: !o.isActive } : o));
    setOffers(next);
    await saveOffersOnly(next);
  }

  const generalOffers = useMemo(
    () => offers.filter((o) => (o.offerKind || inferKind(o)) === OFFER_KIND.GENERAL),
    [offers]
  );

  const timeSlotOffers = useMemo(
    () => offers.filter((o) => (o.offerKind || inferKind(o)) === OFFER_KIND.TIME_SLOT),
    [offers]
  );

  const visitOffers = useMemo(
    () => offers.filter((o) => (o.offerKind || inferKind(o)) === OFFER_KIND.VISIT),
    [offers]
  );

  const dishOffers = useMemo(
    () => offers.filter((o) => (o.offerKind || inferKind(o)) === OFFER_KIND.DISH),
    [offers]
  );

  const activeOffers = useMemo(
    () =>
      offers.filter((o) => {
        const k = o.offerKind || inferKind(o);
        if (k === OFFER_KIND.VISIT) return false;
        return Boolean(o.isActive);
      }),
    [offers]
  );

  function renderSection(title, sectionOffers, kind, hint, premium = false) {
    const locked = premium && !isSubscribed;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{hint}</p>
          </div>

          {locked ? (
            <button
              onClick={openPayment}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 cursor-pointer"
            >
              Unlock Premium
            </button>
          ) : kind === OFFER_KIND.VISIT ? (
            <button
              onClick={() => {
                if (sectionOffers?.length) openEdit(sectionOffers[0].id);
                else openCreate(OFFER_KIND.VISIT);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              {sectionOffers?.length ? "Edit Program" : "+ Setup Program"}
            </button>
          ) : (
            <button
              onClick={() => openCreate(kind)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              + Add
            </button>
          )}
        </div>

        {locked ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            This section is available for Premium partners only.
          </div>
        ) : sectionOffers.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">No {title.toLowerCase()} yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sectionOffers.map((o) => {
              const k = o.offerKind || inferKind(o);
              const isVisit = k === OFFER_KIND.VISIT;

              return (
                <div
                  key={o.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {isVisit ? "Repeat Rewards Program" : o.title}
                      </span>

                      {!isVisit && o.promoCode ? (
                        <span className="text-xs font-mono rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                          {o.promoCode}
                        </span>
                      ) : null}

                      {!isVisit ? (
                        o.isActive ? (
                          <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                            Inactive
                          </span>
                        )
                      ) : (
                        <span className="text-xs rounded-full bg-slate-900 text-white px-2 py-1">
                          Standard
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-1">{formatOfferLine(o)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isVisit ? (
                      <>
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
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (loading) return <Skeleton />;

  const currentKind = formOffer.offerKind || inferKind(formOffer);
  const isVisitForm = currentKind === OFFER_KIND.VISIT;
  const isDishForm = currentKind === OFFER_KIND.DISH;

  return (
    <div className="min-h-screen bg-slate-50">
      {lastError ? (
        <div className="max-w-6xl mx-auto px-6 pt-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {lastError}
          </div>
        </div>
      ) : null}

      {saving ? (
        <div className="fixed top-4 right-4 z-[80] rounded-xl bg-slate-900 text-white px-4 py-2 text-sm shadow-lg">
          Saving...
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs text-slate-500">Partner Offer Center</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{activeOffers.length} active campaigns</p>
          <p className="text-sm text-slate-600 mt-1">
            General offers are available for all partners. Time-slot, repeat rewards, and dish discounts are premium features.
          </p>
          <p className="text-xs mt-2">
            {isSubscribed ? (
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">Premium Active</span>
            ) : (
              <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-1">Premium Locked</span>
            )}
          </p>
        </div>

        {renderSection(
          "General Offers",
          generalOffers,
          OFFER_KIND.GENERAL,
          "Standard campaigns available to every partner",
          false
        )}
        {renderSection(
          "Time Slot Offers",
          timeSlotOffers,
          OFFER_KIND.TIME_SLOT,
          "Day and time-specific premium campaigns",
          true
        )}
        {renderSection(
          "Repeat Rewards",
          visitOffers,
          OFFER_KIND.VISIT,
          "Premium loyalty rewards program for repeat visits",
          true
        )}
        {renderSection(
          "Dish Discounts",
          dishOffers,
          OFFER_KIND.DISH,
          "Premium dish-level discounts on specific menu items",
          true
        )}
      </div>

      <button
        type="button"
        onClick={() => openCreate(OFFER_KIND.GENERAL)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#DA3224] text-white text-3xl flex items-center justify-center shadow-lg hover:opacity-95 active:scale-95 transition"
        title="Create general offer"
      >
        +
      </button>

      {openPaymentModal && (
        <div className="fixed inset-0 z-[90] p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => !paying && setOpenPaymentModal(false)} />
          <div className="relative mx-auto w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Premium Payment</p>
              <button
                onClick={() => !paying && setOpenPaymentModal(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                Demo card: {DEMO_CARD.number} | {DEMO_CARD.expiry} | {DEMO_CARD.cvv}
              </div>

              {paymentError ? (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                  {paymentError}
                </div>
              ) : null}

              <div>
                <p className="text-xs text-slate-600 mb-2">Cardholder name</p>
                <input
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Demo User"
                  className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none border border-slate-200"
                />
              </div>

              <div>
                <p className="text-xs text-slate-600 mb-2">Card number</p>
                <input
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-600 mb-2">Expiry</p>
                  <input
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="12/34"
                    inputMode="numeric"
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none border border-slate-200"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-2">CVV</p>
                  <input
                    value={cardCvv}
                    onChange={(e) => setCardCvv(formatCvv(e.target.value))}
                    placeholder="123"
                    inputMode="numeric"
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none border border-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3 bg-white">
              <button
                onClick={() => !paying && setOpenPaymentModal(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={onPayAndUnlock}
                disabled={paying}
                className="rounded-xl bg-[#DA3224] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {paying ? "Processing..." : "Pay & Unlock Premium"}
              </button>
            </div>
          </div>
        </div>
      )}

      {openModal && (
        <div className="fixed inset-0 z-[60] p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenModal(false)} />
          <div className="relative mx-auto w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
              <p className="text-sm font-semibold text-slate-900">
                {isVisitForm
                  ? "Repeat Rewards Program"
                  : isDishForm
                  ? "Dish Discount Offer"
                  : editingOfferId
                  ? "Edit offer"
                  : "Create offer"}
              </p>
              <button
                onClick={() => setOpenModal(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="px-6 py-6 space-y-6 overflow-y-auto">
              {!isVisitForm ? (
                <div>
                  <p className="text-xs text-slate-600 mb-2">Offer type</p>
                  <select
                    value={formOffer.offerKind}
                    onChange={(e) => {
                      const kind = e.target.value;
                      if (!ensurePremium(kind)) return;
                      setFormOffer((prev) => ({
                        ...prev,
                        offerKind: kind,
                        weekdays: kind === OFFER_KIND.TIME_SLOT ? prev.weekdays || [] : [],
                        slotStart: kind === OFFER_KIND.TIME_SLOT ? prev.slotStart || "" : "",
                        slotEnd: kind === OFFER_KIND.TIME_SLOT ? prev.slotEnd || "" : "",
                        dishDiscount:
                          kind === OFFER_KIND.DISH
                            ? prev.dishDiscount || {
                                dishId: "",
                                dishName: "",
                                sectionId: "",
                                sectionName: "",
                              }
                            : {
                                dishId: "",
                                dishName: "",
                                sectionId: "",
                                sectionName: "",
                              },
                      }));
                    }}
                    className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <option value={OFFER_KIND.GENERAL}>General Offer</option>
                    <option value={OFFER_KIND.TIME_SLOT} disabled={!isSubscribed}>
                      Time Slot Offer (Premium)
                    </option>
                    <option value={OFFER_KIND.DISH} disabled={!isSubscribed}>
                      Dish Discount (Premium)
                    </option>
                  </select>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Standard loyalty program</p>
                  <p className="text-xs text-slate-600 mt-1">
                    This reward setup applies to all customers and encourages repeat dining.
                  </p>
                </div>
              )}

              {!isVisitForm && (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-600 mb-2">Offer title</p>
                      <input
                        placeholder="e.g. Lunch Deal"
                        value={formOffer.title}
                        onChange={(e) => setFormOffer({ ...formOffer, title: e.target.value })}
                        className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-slate-600 mb-2">Promo code</p>
                      <input
                        placeholder="e.g. SAVE20"
                        value={formOffer.promoCode}
                        onChange={(e) => setFormOffer({ ...formOffer, promoCode: e.target.value.toUpperCase() })}
                        className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </div>

                  {isDishForm && (
                    <div>
                      <p className="text-xs text-slate-600 mb-2">Select dish</p>
                      <select
                        value={formOffer?.dishDiscount?.dishId || ""}
                        onChange={(e) => {
                          const dishId = e.target.value;
                          const found = menuItems.find((m) => m.dishId === dishId);
                          setFormOffer((prev) => ({
                            ...prev,
                            dishDiscount: {
                              dishId: found?.dishId || "",
                              dishName: found?.dishName || "",
                              sectionId: found?.sectionId || "",
                              sectionName: found?.sectionName || "",
                            },
                          }));
                        }}
                        className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Select a dish</option>
                        {menuItems.map((m) => (
                          <option key={m.dishId} value={m.dishId}>
                            {m.sectionName ? `${m.sectionName} -> ` : ""}
                            {m.dishName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

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
                        {formOffer.discountType === "PERCENT" ? "% OFF" : "Rs OFF"}
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

                  {formOffer.offerKind === OFFER_KIND.TIME_SLOT && (
                    <>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-600 mb-2">Slot start</p>
                          <input
                            type="time"
                            value={formOffer.slotStart}
                            onChange={(e) => setFormOffer({ ...formOffer, slotStart: e.target.value })}
                            className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                          />
                        </div>

                        <div>
                          <p className="text-xs text-slate-600 mb-2">Slot end</p>
                          <input
                            type="time"
                            value={formOffer.slotEnd}
                            onChange={(e) => setFormOffer({ ...formOffer, slotEnd: e.target.value })}
                            className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-5 space-y-3">
                        <p className="text-sm font-semibold text-slate-900">Weekdays</p>
                        <div className="flex flex-wrap gap-2">
                          {WEEK_DAYS.map((d) => {
                            const active = formOffer.weekdays.includes(d.key);
                            return (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => toggleDay(d.key)}
                                className={`rounded-full px-3 py-1.5 text-xs border ${
                                  active
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {isVisitForm && (
                <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                  <p className="text-sm font-semibold text-slate-900">Visit rewards (1 to 10)</p>

                  <div className="space-y-3">
                    {(formOffer.visitRewards?.tiers || []).map((tier) => (
                      <div key={tier.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[11px] text-slate-600 mb-1">Visit # (1-10)</p>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={tier.visitCount}
                              onChange={(e) => patchVisitTier(tier.id, { visitCount: e.target.value })}
                              className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200"
                              placeholder="1"
                            />
                          </div>

                          <div>
                            <p className="text-[11px] text-slate-600 mb-1">Reward type</p>
                            <select
                              value={tier.rewardType}
                              onChange={(e) =>
                                patchVisitTier(tier.id, {
                                  rewardType: e.target.value,
                                  rewardLabel: "",
                                  rewardValue: "",
                                })
                              }
                              className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200"
                            >
                              <option value="FREE_ITEM">Free item</option>
                              <option value="PERCENT">Percent off</option>
                              <option value="FLAT">Flat off</option>
                            </select>
                          </div>

                          <div>
                            {tier.rewardType === "FREE_ITEM" ? (
                              <>
                                <p className="text-[11px] text-slate-600 mb-1">Free item name</p>
                                <input
                                  value={tier.rewardLabel}
                                  onChange={(e) => patchVisitTier(tier.id, { rewardLabel: e.target.value })}
                                  className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200"
                                  placeholder="Free Coke"
                                />
                              </>
                            ) : (
                              <>
                                <p className="text-[11px] text-slate-600 mb-1">
                                  {tier.rewardType === "PERCENT" ? "Percent" : "Amount (Rs)"}
                                </p>
                                <input
                                  type="number"
                                  value={tier.rewardValue}
                                  onChange={(e) => patchVisitTier(tier.id, { rewardValue: e.target.value })}
                                  className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border border-slate-200"
                                  placeholder={tier.rewardType === "PERCENT" ? "10" : "100"}
                                />
                              </>
                            )}
                          </div>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeVisitTier(tier.id)}
                              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addVisitTier}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    + Add Visit Reward Tier
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3 shrink-0 bg-white">
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
                {saving ? "Saving..." : editingOfferId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
