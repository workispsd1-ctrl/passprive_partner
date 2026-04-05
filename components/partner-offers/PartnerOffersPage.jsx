"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Store, UtensilsCrossed, Tag } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  createOffer,
  createOfferCondition,
  createOfferTarget,
  deleteOffer,
  deleteOfferCondition,
  deleteOfferTarget,
  getOffer,
  getOfferConditions,
  getOfferTargets,
  getOffers,
  getOfferUsageLimit,
  testRestaurantApplicable,
  testStoreApplicable,
  updateOffer,
  updateOfferCondition,
  updateOfferUsageLimit,
} from "@/lib/partner-offers/api";
import { loadPartnerOfferEntities } from "@/lib/partner-offers/entities";
import { Badge, Card, EmptyState, Field, Input, Select } from "./ui";
import { PartnerOfferForm } from "./PartnerOfferForm";
import { PartnerOfferTargetsEditor } from "./PartnerOfferTargetsEditor";
import { PartnerOfferConditionsEditor } from "./PartnerOfferConditionsEditor";
import { PartnerOfferLimitsEditor } from "./PartnerOfferLimitsEditor";
import { PartnerOfferApplicabilityTester } from "./PartnerOfferApplicabilityTester";

const TERMS = [
  "Customers must inform the cashier that they will pay through the District app before making payment.",
  "PassPrive has no role to play in taxes and charges levied by the government or the outlet.",
  "Offers are applicable only on payment through the app and not on cash transactions.",
];

function toLocalDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toStartOfDayIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toEndOfDayIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function todayInputValue() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function emptyOfferForm(entitySeed = {}) {
  return {
    id: "",
    source_type: "MERCHANT",
    owner_entity_type: entitySeed.owner_entity_type || "STORE",
    owner_entity_id: entitySeed.owner_entity_id || "",
    title: "",
    short_title: "",
    subtitle: "",
    description: "",
    badge_text: "",
    ribbon_text: "",
    banner_image_url: "",
    offer_type: "PERCENTAGE_DISCOUNT",
    benefit_value: "",
    max_discount_amount: "",
    currency_code: "MUR",
    min_bill_amount: "",
    is_auto_apply: true,
    is_active: true,
    is_stackable: false,
    stack_group: "",
    priority: "0",
    status: "DRAFT",
    starts_at: "",
    ends_at: "",
    accepted_terms: TERMS.reduce((acc, term) => ({ ...acc, [term]: false }), {}),
  };
}

function emptyTargetForm(entitySeed = {}) {
  return {
    target_type: entitySeed.owner_entity_type || "STORE",
    target_value: entitySeed.owner_entity_id || "",
  };
}

function emptyConditionForm() {
  return {
    id: "",
    condition_type: "MIN_BILL_AMOUNT",
    condition_value: "",
  };
}

function emptyLimits() {
  return {
    total_redemption_limit: "",
    per_user_redemption_limit: "",
    per_entity_redemption_limit: "",
    per_day_redemption_limit: "",
    budget_amount: "",
    budget_currency: "MUR",
  };
}

function emptyTester(entitySeed = {}) {
  return {
    entity_type: entitySeed.owner_entity_type || "STORE",
    entity_id: entitySeed.owner_entity_id || "",
    bill_amount: "",
    payment_flow: "ANY",
  };
}

function normalizeOffer(raw) {
  const backendOfferType = String(raw?.offer_type || "").toUpperCase();
  const uiOfferType =
    backendOfferType === "PERCENT_OFF"
      ? "PERCENTAGE_DISCOUNT"
      : backendOfferType === "AMOUNT_OFF" || backendOfferType === "FLAT_OFF"
      ? "FLAT_DISCOUNT"
      : backendOfferType === "CASHBACK"
      ? "CASHBACK"
      : "PERCENTAGE_DISCOUNT";

  return {
    ...emptyOfferForm(),
    ...raw,
    id: String(raw?.id || ""),
    source_type: "MERCHANT",
    owner_entity_type: raw?.owner_entity_type || "STORE",
    owner_entity_id: String(raw?.owner_entity_id || ""),
    offer_type: uiOfferType,
    benefit_value:
      backendOfferType === "PERCENT_OFF"
        ? raw?.benefit_percent ?? ""
        : raw?.benefit_value ?? "",
    max_discount_amount: raw?.max_discount_amount ?? "",
    min_bill_amount: raw?.min_bill_amount ?? "",
    priority: raw?.priority ?? "0",
    starts_at: toLocalDateInput(raw?.starts_at),
    ends_at: toLocalDateInput(raw?.ends_at),
    accepted_terms: TERMS.reduce((acc, term) => ({ ...acc, [term]: true }), {}),
  };
}

function normalizeLimits(raw) {
  return {
    ...emptyLimits(),
    ...raw,
    total_redemption_limit: raw?.total_redemption_limit ?? "",
    per_user_redemption_limit: raw?.per_user_redemption_limit ?? "",
    per_entity_redemption_limit: raw?.per_entity_redemption_limit ?? "",
    per_day_redemption_limit: raw?.per_day_redemption_limit ?? "",
    budget_amount: raw?.budget_amount ?? "",
    budget_currency: raw?.budget_currency || "MUR",
  };
}

function likelyReason(offer, tester) {
  const start = toStartOfDayIsoOrNull(offer?.starts_at);
  const end = toEndOfDayIsoOrNull(offer?.ends_at);
  const now = Date.now();
  if (start && new Date(start).getTime() > now) return "The offer has not started yet.";
  if (end && new Date(end).getTime() < now) return "The offer has already ended.";
  if (!offer?.is_active || offer?.status === "PAUSED") return "The offer is paused or inactive.";
  if (offer?.min_bill_amount && Number(tester.bill_amount || 0) < Number(offer.min_bill_amount)) {
    return "The bill amount is below this offer's minimum bill.";
  }
  return "The offer did not match the returned applicable set for the selected entity and test inputs.";
}

function serializeOffer(form, ownerEntityOptions, ownerEntityId) {
  const allowedEntities = ownerEntityOptions[form.owner_entity_type] || [];
  const entity = allowedEntities.find((row) => String(row.id) === String(ownerEntityId));
  if (!entity) throw new Error("Choose one of your own stores or restaurants.");

  const uiOfferType = String(form.offer_type || "").toUpperCase();
  const offerType =
    uiOfferType === "PERCENTAGE_DISCOUNT"
      ? "PERCENT_OFF"
      : uiOfferType === "FLAT_DISCOUNT"
      ? "AMOUNT_OFF"
      : "CASHBACK";
  const badgeText = String(form.badge_text || "").trim() || String(form.short_title || form.title || "Merchant offer").trim();

  if (!String(form.title || "").trim()) throw new Error("Offer title is required.");
  if (!String(form.offer_type || "").trim()) throw new Error("Offer type is required.");

  const startsAt = toStartOfDayIsoOrNull(form.starts_at);
  const endsAt = toEndOfDayIsoOrNull(form.ends_at);
  if (!startsAt || !endsAt) throw new Error("Offer active dates are required.");
  if (new Date(startsAt).getTime() < new Date(toStartOfDayIsoOrNull(todayInputValue())).getTime()) {
    throw new Error("Offer start date cannot be in the past.");
  }
  if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Offer end date cannot be before the start date.");
  }

  if (form.benefit_value === "" || Number(form.benefit_value) <= 0) {
    throw new Error("Benefit value is required.");
  }
  if (!TERMS.every((term) => form.accepted_terms?.[term])) {
    throw new Error("Please accept all merchant offer terms.");
  }

  const payload = {
    source_type: "MERCHANT",
    owner_entity_type: form.owner_entity_type,
    owner_entity_id: ownerEntityId,
    module: form.owner_entity_type,
    title: String(form.title || "").trim(),
    short_title: String(form.short_title || "").trim() || null,
    subtitle: String(form.subtitle || "").trim() || null,
    description: String(form.description || "").trim() || null,
    badge_text: badgeText,
    ribbon_text: String(form.ribbon_text || "").trim() || null,
    banner_image_url: String(form.banner_image_url || "").trim() || null,
    offer_type: offerType,
    benefit_value: offerType === "PERCENT_OFF" ? null : Number(form.benefit_value),
    benefit_percent: offerType === "PERCENT_OFF" ? Number(form.benefit_value) : null,
    max_discount_amount: form.max_discount_amount === "" ? null : Number(form.max_discount_amount),
    currency_code: String(form.currency_code || "MUR").trim().toUpperCase(),
    min_bill_amount: form.min_bill_amount === "" ? null : Number(form.min_bill_amount),
    is_active: Boolean(form.is_active),
    is_stackable: Boolean(form.is_stackable),
    priority: Number(form.priority || 0),
    status: String(form.status || "DRAFT").trim().toUpperCase(),
    starts_at: startsAt,
    ends_at: endsAt,
    terms_and_conditions: TERMS.join("\n"),
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== "")
  );
}

export function PartnerOffersPage({ partnerEntityType = "STORE" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [deletingOffer, setDeletingOffer] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [deletingTargetId, setDeletingTargetId] = useState("");
  const [savingCondition, setSavingCondition] = useState(false);
  const [deletingConditionId, setDeletingConditionId] = useState("");
  const [savingLimits, setSavingLimits] = useState(false);
  const [testingOffer, setTestingOffer] = useState(false);

  const [stores, setStores] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");

  const [form, setForm] = useState(emptyOfferForm());
  const [targetForm, setTargetForm] = useState(emptyTargetForm());
  const [conditionForm, setConditionForm] = useState(emptyConditionForm());
  const [limitsForm, setLimitsForm] = useState(emptyLimits());
  const [tester, setTester] = useState(emptyTester());
  const [selectedOwnerEntityIds, setSelectedOwnerEntityIds] = useState([]);
  const [applyAllOwnerEntities, setApplyAllOwnerEntities] = useState(false);

  const [targets, setTargets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [testResult, setTestResult] = useState(null);

  const [filters, setFilters] = useState({
    entity_key: "ALL",
    active: "ALL",
    status: "ALL",
    search: "",
  });

  const allEntities = useMemo(() => [...stores, ...restaurants], [stores, restaurants]);
  const ownerEntityOptions = useMemo(
    () => ({
      STORE: stores,
      RESTAURANT: restaurants,
    }),
    [stores, restaurants]
  );
  const partnerEntities = useMemo(
    () => ownerEntityOptions[partnerEntityType] || [],
    [ownerEntityOptions, partnerEntityType]
  );
  const entitiesByType = ownerEntityOptions;

  const accessibleKeys = useMemo(() => {
    const set = new Set();
    partnerEntities.forEach((row) => set.add(`${partnerEntityType}:${row.id}`));
    return set;
  }, [partnerEntities, partnerEntityType]);

  const effectiveOwnerEntityIds = useMemo(() => {
    if (applyAllOwnerEntities) return partnerEntities.map((entity) => String(entity.id));
    return selectedOwnerEntityIds;
  }, [applyAllOwnerEntities, partnerEntities, selectedOwnerEntityIds]);

  const filteredOffers = useMemo(() => {
    return offers
      .filter((offer) => offer.source_type === "MERCHANT")
      .filter((offer) => offer.owner_entity_type === partnerEntityType)
      .filter((offer) => accessibleKeys.has(`${offer.owner_entity_type}:${offer.owner_entity_id}`))
      .filter((offer) => {
        if (filters.entity_key === "ALL") return true;
        return `${offer.owner_entity_type}:${offer.owner_entity_id}` === filters.entity_key;
      })
      .filter((offer) => {
        if (filters.active === "ALL") return true;
        return filters.active === "ACTIVE_ONLY" ? Boolean(offer.is_active) : !offer.is_active;
      })
      .filter((offer) => {
        if (filters.status === "ALL") return true;
        return String(offer.status || "").toUpperCase() === filters.status;
      })
      .filter((offer) => {
        const search = String(filters.search || "").trim().toLowerCase();
        if (!search) return true;
        return String(offer.title || "").toLowerCase().includes(search);
      })
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  }, [offers, filters, accessibleKeys, partnerEntityType]);

  const selectedOffer = useMemo(
    () => offers.find((offer) => String(offer.id) === String(selectedOfferId)) || null,
    [offers, selectedOfferId]
  );

  const loadOffers = async (silent = false) => {
    if (silent) setRefreshing(true);
    const response = await getOffers();
    const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : response?.offers || [];
    setOffers(
      rows.filter((offer) => {
        const key = `${offer.owner_entity_type}:${offer.owner_entity_id}`;
        return offer.source_type === "MERCHANT" && accessibleKeys.has(key);
      })
    );
    setRefreshing(false);
  };

  const loadOfferDetails = async (offerId) => {
    if (!offerId) return;
    const [offerRes, targetsRes, conditionsRes, limitsRes] = await Promise.all([
      getOffer(offerId),
      getOfferTargets(offerId),
      getOfferConditions(offerId),
      getOfferUsageLimit(offerId),
    ]);

    const offerPayload = offerRes?.data || offerRes?.offer || offerRes;
    const targetRows = Array.isArray(targetsRes?.data) ? targetsRes.data : Array.isArray(targetsRes) ? targetsRes : targetsRes?.targets || [];
    const conditionRows = Array.isArray(conditionsRes?.data) ? conditionsRes.data : Array.isArray(conditionsRes) ? conditionsRes : conditionsRes?.conditions || [];
    const limitPayload = limitsRes?.data || limitsRes?.usage_limit || limitsRes || {};

    setForm(normalizeOffer(offerPayload));
    setTargets(targetRows);
    setConditions(conditionRows);
    setLimitsForm(normalizeLimits(limitPayload));
    setTargetForm(
      emptyTargetForm({
        owner_entity_type: offerPayload?.owner_entity_type,
        owner_entity_id: String(offerPayload?.owner_entity_id || ""),
      })
    );
    setConditionForm(emptyConditionForm());
    setTester(
      emptyTester({
        owner_entity_type: partnerEntityType,
        owner_entity_id: String(offerPayload?.owner_entity_id || ""),
      })
    );
    setTestResult(null);
    setSelectedOwnerEntityIds(offerPayload?.owner_entity_id ? [String(offerPayload.owner_entity_id)] : []);
    setApplyAllOwnerEntities(false);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const { data: sess, error } = await supabaseBrowser.auth.getSession();
        if (error) throw error;
        const userId = sess?.session?.user?.id;
        if (!userId) {
          router.replace("/sign-in");
          return;
        }

        const entities = await loadPartnerOfferEntities(supabaseBrowser, userId);
        if (cancelled) return;

        setStores(entities.stores);
        setRestaurants(entities.restaurants);

        const partnerSeedList = partnerEntityType === "RESTAURANT" ? entities.restaurants : entities.stores;
        const seedEntity = partnerSeedList[0]
          ? {
              owner_entity_type: partnerEntityType,
              owner_entity_id: String(partnerSeedList[0].id),
            }
          : {};

        setForm(emptyOfferForm(seedEntity));
        setTargetForm(emptyTargetForm(seedEntity));
        setTester(emptyTester(seedEntity));
        setSelectedOwnerEntityIds(seedEntity.owner_entity_id ? [seedEntity.owner_entity_id] : []);
        setApplyAllOwnerEntities(false);

        const response = await getOffers();
        if (cancelled) return;

        const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : response?.offers || [];
        const merchantRows = rows.filter((offer) => {
          const key = `${offer.owner_entity_type}:${offer.owner_entity_id}`;
          return (
            offer.source_type === "MERCHANT" &&
            offer.owner_entity_type === partnerEntityType &&
            partnerSeedList.some((entity) => key === `${partnerEntityType}:${entity.id}`)
          );
        });

        setOffers(merchantRows);
      } catch (error) {
        if (!cancelled) toast.error(error?.message || "Failed to load merchant offers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, partnerEntityType]);

  useEffect(() => {
    if (!selectedOfferId) return;
    (async () => {
      try {
        await loadOfferDetails(selectedOfferId);
      } catch (error) {
        toast.error(error?.message || "Failed to load offer details.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOfferId]);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateTargetForm = (key, value) => setTargetForm((prev) => ({ ...prev, [key]: value }));
  const updateConditionForm = (key, value) => setConditionForm((prev) => ({ ...prev, [key]: value }));
  const updateLimitsForm = (key, value) => setLimitsForm((prev) => ({ ...prev, [key]: value }));
  const updateTester = (key, value) => setTester((prev) => ({ ...prev, [key]: value }));

  const handleCreateNew = () => {
    const seed = partnerEntities[0]
      ? {
          owner_entity_type: partnerEntityType,
          owner_entity_id: String(partnerEntities[0].id),
        }
      : {};
    setSelectedOfferId("");
    setForm(emptyOfferForm(seed));
    setTargets([]);
    setConditions([]);
    setLimitsForm(emptyLimits());
    setTargetForm(emptyTargetForm(seed));
    setConditionForm(emptyConditionForm());
    setTester(emptyTester(seed));
    setTestResult(null);
    setSelectedOwnerEntityIds(seed.owner_entity_id ? [seed.owner_entity_id] : []);
    setApplyAllOwnerEntities(false);
  };

  const handleSaveOffer = async () => {
    try {
      setSavingOffer(true);
      if (!selectedOfferId && !effectiveOwnerEntityIds.length) {
        throw new Error(`Select at least one ${partnerEntityType === "STORE" ? "store" : "restaurant"}.`);
      }

      let saved;
      if (selectedOfferId) {
        const payload = serializeOffer(form, ownerEntityOptions, form.owner_entity_id);
        const response = await updateOffer(selectedOfferId, payload);
        saved = response?.data || response?.offer || response;
        toast.success("Merchant offer updated.");
      } else {
        const responses = [];
        for (const ownerEntityId of effectiveOwnerEntityIds) {
          const payload = serializeOffer(form, ownerEntityOptions, ownerEntityId);
          const response = await createOffer(payload);
          responses.push(response?.data || response?.offer || response);
        }
        saved = responses[0];
        toast.success(
          responses.length > 1
            ? `${responses.length} merchant offers created.`
            : "Merchant offer created."
        );
      }

      await loadOffers(true);
      setSelectedOfferId(String(saved?.id || selectedOfferId));
      if (!selectedOfferId && saved?.id) {
        await loadOfferDetails(saved.id);
      } else if (selectedOfferId) {
        await loadOfferDetails(selectedOfferId);
      }
    } catch (error) {
      toast.error(error?.message || "Failed to save merchant offer.");
    } finally {
      setSavingOffer(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!selectedOfferId) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm("Delete this merchant offer? This action cannot be undone.");
      if (!ok) return;
    }
    try {
      setDeletingOffer(true);
      await deleteOffer(selectedOfferId);
      toast.success("Merchant offer deleted.");
      await loadOffers(true);
      handleCreateNew();
    } catch (error) {
      toast.error(error?.message || "Failed to delete merchant offer.");
    } finally {
      setDeletingOffer(false);
    }
  };

  const handleArchiveOffer = async () => {
    if (!selectedOfferId) return;
    try {
      setSavingOffer(true);
      const payload = serializeOffer(
        { ...form, status: "ARCHIVED", is_active: false },
        ownerEntityOptions,
        form.owner_entity_id
      );
      await updateOffer(selectedOfferId, payload);
      toast.success("Merchant offer archived.");
      await loadOffers(true);
      await loadOfferDetails(selectedOfferId);
    } catch (error) {
      toast.error(error?.message || "Failed to archive merchant offer.");
    } finally {
      setSavingOffer(false);
    }
  };

  const handleAddTarget = async () => {
    if (!selectedOfferId) return;
    const value = String(targetForm.target_value || "").trim();
    if (!value) {
      toast.error("Target value is required.");
      return;
    }
    if (targetForm.target_type === "STORE" && !stores.some((row) => String(row.id) === value)) {
      toast.error("Choose one of your own stores.");
      return;
    }
    if (targetForm.target_type === "RESTAURANT" && !restaurants.some((row) => String(row.id) === value)) {
      toast.error("Choose one of your own restaurants.");
      return;
    }
    try {
      setSavingTarget(true);
      await createOfferTarget(selectedOfferId, {
        target_type: targetForm.target_type,
        target_value: value,
      });
      toast.success("Merchant target added.");
      const nextTargets = await getOfferTargets(selectedOfferId);
      setTargets(Array.isArray(nextTargets?.data) ? nextTargets.data : Array.isArray(nextTargets) ? nextTargets : nextTargets?.targets || []);
      setTargetForm(emptyTargetForm({ owner_entity_type: form.owner_entity_type, owner_entity_id: form.owner_entity_id }));
    } catch (error) {
      toast.error(error?.message || "Failed to add target.");
    } finally {
      setSavingTarget(false);
    }
  };

  const handleDeleteTarget = async (target) => {
    try {
      setDeletingTargetId(String(target.id));
      await deleteOfferTarget(selectedOfferId, target.id);
      setTargets((prev) => prev.filter((row) => String(row.id) !== String(target.id)));
      toast.success("Target deleted.");
    } catch (error) {
      toast.error(error?.message || "Failed to delete target.");
    } finally {
      setDeletingTargetId("");
    }
  };

  const handleAddCondition = async () => {
    if (!selectedOfferId) return;
    if (!String(conditionForm.condition_value || "").trim()) {
      toast.error("Condition value is required.");
      return;
    }
    try {
      setSavingCondition(true);
      await createOfferCondition(selectedOfferId, {
        condition_type: conditionForm.condition_type,
        condition_value: String(conditionForm.condition_value || "").trim(),
      });
      const nextConditions = await getOfferConditions(selectedOfferId);
      setConditions(Array.isArray(nextConditions?.data) ? nextConditions.data : Array.isArray(nextConditions) ? nextConditions : nextConditions?.conditions || []);
      setConditionForm(emptyConditionForm());
      toast.success("Condition added.");
    } catch (error) {
      toast.error(error?.message || "Failed to add condition.");
    } finally {
      setSavingCondition(false);
    }
  };

  const handleUpdateCondition = async () => {
    if (!selectedOfferId || !conditionForm.id) return;
    try {
      setSavingCondition(true);
      await updateOfferCondition(selectedOfferId, conditionForm.id, {
        condition_type: conditionForm.condition_type,
        condition_value: String(conditionForm.condition_value || "").trim(),
      });
      const nextConditions = await getOfferConditions(selectedOfferId);
      setConditions(Array.isArray(nextConditions?.data) ? nextConditions.data : Array.isArray(nextConditions) ? nextConditions : nextConditions?.conditions || []);
      setConditionForm(emptyConditionForm());
      toast.success("Condition updated.");
    } catch (error) {
      toast.error(error?.message || "Failed to update condition.");
    } finally {
      setSavingCondition(false);
    }
  };

  const handleDeleteCondition = async (condition) => {
    try {
      setDeletingConditionId(String(condition.id));
      await deleteOfferCondition(selectedOfferId, condition.id);
      setConditions((prev) => prev.filter((row) => String(row.id) !== String(condition.id)));
      toast.success("Condition deleted.");
    } catch (error) {
      toast.error(error?.message || "Failed to delete condition.");
    } finally {
      setDeletingConditionId("");
    }
  };

  const handleSaveLimits = async () => {
    if (!selectedOfferId) return;
    try {
      setSavingLimits(true);
      await updateOfferUsageLimit(selectedOfferId, {
        total_redemption_limit: limitsForm.total_redemption_limit === "" ? null : Number(limitsForm.total_redemption_limit),
        per_user_redemption_limit: limitsForm.per_user_redemption_limit === "" ? null : Number(limitsForm.per_user_redemption_limit),
        per_entity_redemption_limit: limitsForm.per_entity_redemption_limit === "" ? null : Number(limitsForm.per_entity_redemption_limit),
        per_day_redemption_limit: limitsForm.per_day_redemption_limit === "" ? null : Number(limitsForm.per_day_redemption_limit),
        budget_amount: limitsForm.budget_amount === "" ? null : Number(limitsForm.budget_amount),
        budget_currency: limitsForm.budget_currency || "MUR",
      });
      toast.success("Usage limits saved.");
    } catch (error) {
      toast.error(error?.message || "Failed to save usage limits.");
    } finally {
      setSavingLimits(false);
    }
  };

  const handleRunTester = async () => {
    if (!selectedOfferId) return;
    if (!tester.entity_id) {
      toast.error("Choose one of your own entities to test.");
      return;
    }
    try {
      setTestingOffer(true);
      const params = {
        bill_amount: tester.bill_amount,
        payment_flow: tester.payment_flow,
      };
      const response =
        tester.entity_type === "RESTAURANT"
          ? await testRestaurantApplicable(tester.entity_id, params)
          : await testStoreApplicable(tester.entity_id, params);
      const offersList = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : response?.offers || [];
      setTestResult({
        offers: offersList,
        reason: offersList.some((row) => String(row.id || row.offer_id) === String(selectedOfferId))
          ? ""
          : likelyReason(form, tester),
      });
    } catch (error) {
      toast.error(error?.message || "Failed to test offer applicability.");
    } finally {
      setTestingOffer(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-4">
        <Card
          title="Your Offers"
          subtitle="Partner portal is limited to merchant-funded offers only. Platform and bank offers remain admin-managed."
          right={
            <button
              type="button"
              onClick={() => loadOffers(true)}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          }
        >
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading merchant offers...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Linked {partnerEntityType === "STORE" ? "Stores" : "Restaurants"}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    {partnerEntityType === "STORE" ? (
                      <Store className="h-5 w-5 text-[#771FA8]" />
                    ) : (
                      <UtensilsCrossed className="h-5 w-5 text-emerald-600" />
                    )}
                    {partnerEntities.length}
                  </div>
                </div>
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Merchant Offers</div>
                  <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Tag className="h-5 w-5 text-sky-600" />
                    {filteredOffers.length}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label={partnerEntityType === "STORE" ? "Store" : "Restaurant"}>
                  <Select value={filters.entity_key} onChange={(e) => setFilters((prev) => ({ ...prev, entity_key: e.target.value }))}>
                    <option value="ALL">All linked {partnerEntityType === "STORE" ? "stores" : "restaurants"}</option>
                    {partnerEntities.map((entity) => (
                      <option key={`${entity.owner_entity_type}:${entity.id}`} value={`${entity.owner_entity_type}:${entity.id}`}>
                        {entity.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Active Filter">
                  <Select value={filters.active} onChange={(e) => setFilters((prev) => ({ ...prev, active: e.target.value }))}>
                    <option value="ALL">Active + inactive</option>
                    <option value="ACTIVE_ONLY">Active only</option>
                    <option value="INACTIVE_ONLY">Inactive only</option>
                  </Select>
                </Field>
                <Field label="Lifecycle Status">
                  <Select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="ALL">All statuses</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </Select>
                </Field>
                <Field label="Search by Title">
                  <Input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search offers" />
                </Field>
              </div>
            </div>
          )}
        </Card>

        {loading ? null : (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card
              title="Merchant Offer List"
              subtitle={`Only your own ${partnerEntityType === "STORE" ? "store" : "restaurant"} offers are shown here.`}
            >
              {filteredOffers.length ? (
                <div className="space-y-3">
                  {filteredOffers.map((offer) => {
                    const owner = allEntities.find(
                      (entity) =>
                        entity.owner_entity_type === offer.owner_entity_type &&
                        String(entity.id) === String(offer.owner_entity_id)
                    );
                    const active = String(selectedOfferId) === String(offer.id);

                    return (
                      <button
                        key={offer.id}
                        type="button"
                        onClick={() => setSelectedOfferId(String(offer.id))}
                        className={[
                          "w-full rounded-3xl border px-4 py-4 text-left transition",
                          active ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-gray-900">{offer.title}</div>
                          <Badge tone={offer.is_active ? "green" : "red"}>{offer.is_active ? "Active" : "Inactive"}</Badge>
                          <Badge tone="blue">{offer.offer_type || "Offer"}</Badge>
                          <Badge tone="gray">{offer.status || "DRAFT"}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-gray-500">{owner?.name || owner?.label || "Unknown entity"}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span>Badge: {offer.badge_text || "Merchant offer"}</span>
                          <span>Priority: {offer.priority ?? 0}</span>
                          <span>
                            {offer.starts_at ? new Date(offer.starts_at).toLocaleDateString() : "No start"} -{" "}
                            {offer.ends_at ? new Date(offer.ends_at).toLocaleDateString() : "No end"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No merchant offers found"
                  body={`Create a ${partnerEntityType === "STORE" ? "store" : "restaurant"} offer to get started.`}
                />
              )}
            </Card>

            <PartnerOfferForm
              form={form}
              entityType={partnerEntityType}
              entityOptions={partnerEntities}
              selectedEntityIds={selectedOwnerEntityIds}
              setSelectedEntityIds={setSelectedOwnerEntityIds}
              applyAllEntities={applyAllOwnerEntities}
              setApplyAllEntities={setApplyAllOwnerEntities}
              minDate={todayInputValue()}
              onChange={updateForm}
              onSubmit={handleSaveOffer}
              onCreateNew={handleCreateNew}
              onDelete={handleDeleteOffer}
              onArchive={handleArchiveOffer}
              saving={savingOffer}
              deleting={deletingOffer}
              canDelete={Boolean(selectedOfferId)}
              mode={selectedOfferId ? "edit" : "create"}
            />
          </div>
        )}

        {loading ? null : (
          <div className="grid gap-6 xl:grid-cols-2">
            <PartnerOfferTargetsEditor
              offerId={selectedOfferId}
              targets={targets}
              form={targetForm}
              onFormChange={updateTargetForm}
              onAdd={handleAddTarget}
              onDelete={handleDeleteTarget}
              entitiesByType={entitiesByType}
              saving={savingTarget}
              deletingId={deletingTargetId}
            />

            <PartnerOfferConditionsEditor
              offerId={selectedOfferId}
              conditions={conditions}
              form={conditionForm}
              onFormChange={updateConditionForm}
              onAdd={handleAddCondition}
              onUpdate={handleUpdateCondition}
              onEdit={(condition) =>
                setConditionForm({
                  id: String(condition.id),
                  condition_type: condition.condition_type || condition.type || "MIN_BILL_AMOUNT",
                  condition_value: condition.condition_value || condition.value || "",
                })
              }
              onCancelEdit={() => setConditionForm(emptyConditionForm())}
              onDelete={handleDeleteCondition}
              saving={savingCondition}
              deletingId={deletingConditionId}
            />
          </div>
        )}

        {loading ? null : (
          <div className="grid gap-6 xl:grid-cols-2">
            <PartnerOfferLimitsEditor
              offerId={selectedOfferId}
              limits={limitsForm}
              onChange={updateLimitsForm}
              onSave={handleSaveLimits}
              saving={savingLimits}
            />

            <PartnerOfferApplicabilityTester
              offer={selectedOffer || (selectedOfferId ? { ...form, id: selectedOfferId } : null)}
              stores={partnerEntityType === "STORE" ? partnerEntities : []}
              restaurants={partnerEntityType === "RESTAURANT" ? partnerEntities : []}
              tester={tester}
              onChange={updateTester}
              onRun={handleRunTester}
              result={testResult}
              loading={testingOffer}
            />
          </div>
        )}
      </div>
    </div>
  );
}
