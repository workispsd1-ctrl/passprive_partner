const HOLD_MINUTES = 15;
const SUPPORTED_TYPES = ["PERCENT_DISCOUNT", "FLAT_DISCOUNT"];
const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;

const cents = (n) => Math.round(Number(n || 0) * 100);
const upper = (v) => String(v ?? "").trim().toUpperCase();

export const PROMO_ERRORS = {
  invalid_code: "Enter a valid promo code.",
  not_found: "This promo code does not exist.",
  not_here: "This promo code can't be used here.",
  expired: "This promo code has expired.",
  min_bill: "The bill is below the minimum for this promo.",
  max_bill: "The bill is above the maximum for this promo.",
  promo_used: "This promo code has already been used.",
  too_large: "This promo is larger than the bill.",
  already_paid: "This bill is already paid.",
  not_applied: "Apply the promo code again.",
  locked: "Too many wrong promo codes. Try again in 15 minutes.",
};

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export async function promoLocked(admin, restaurantId, terminalId) {
  const { count, error } = await admin
    .from("promo_attempts")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("terminal_id", terminalId)
    .eq("ok", false)
    .gte("created_at", new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString());
  if (error) throw error;
  return (count ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordPromoAttempt(admin, restaurantId, terminalId, ok) {
  const { error } = await admin.from("promo_attempts").insert({ restaurant_id: restaurantId, terminal_id: terminalId, ok });
  if (error) throw error;
}

export function cleanCode(code) {
  const c = upper(code).slice(0, 40);
  return /^[A-Z0-9_-]{3,40}$/.test(c) ? c : null;
}

function compare(actual, operator, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  const a = Number(actual);
  const e = Number(Array.isArray(expected) ? expected[0] : expected);
  switch (upper(operator) || "EQ") {
    case "EQ":
      return list.map(String).includes(String(actual));
    case "NEQ":
      return !list.map(String).includes(String(actual));
    case "IN":
      return list.map(String).includes(String(actual));
    case "NOT_IN":
      return !list.map(String).includes(String(actual));
    case "GT":
      return a > e;
    case "GTE":
      return a >= e;
    case "LT":
      return a < e;
    case "LTE":
      return a <= e;
    default:
      return false;
  }
}

function conditionOk(condition, billCents) {
  const type = upper(condition.condition_type);
  const value = condition.condition_value;
  if (type === "MIN_BILL_AMOUNT") return billCents >= cents(value?.amount ?? value);
  if (type === "MAX_BILL_AMOUNT") return billCents <= cents(value?.amount ?? value);
  if (type === "DAY_OF_WEEK") {
    const day = new Date(Date.now() + MAURITIUS_OFFSET_MS).getUTCDay();
    return compare(day, condition.operator, value?.day ?? value);
  }
  return false;
}

function discountFor(offer, billCents) {
  if (offer.offer_type === "PERCENT_DISCOUNT") {
    const pct = Number(offer.benefit_percent ?? offer.Discount_value ?? 0);
    let d = Math.round((billCents * pct) / 100);
    if (offer.max_discount_amount != null) d = Math.min(d, cents(offer.max_discount_amount));
    return d;
  }
  return cents(offer.benefit_value ?? offer.Discount_value ?? 0);
}

export async function quotePromo(admin, restaurantId, code, billCents) {
  const clean = cleanCode(code);
  if (!clean) return { error: "invalid_code" };

  const pattern = clean.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data: rules, error: rulesErr } = await admin
    .from("offer_payment_rules")
    .select("offer_id, coupon_code, payment_instrument_type, card_network, issuer_bank_name, requires_saved_card")
    .eq("requires_coupon_code", true)
    .ilike("coupon_code", pattern);
  if (rulesErr) throw rulesErr;
  const matching = (rules || []).filter((r) => upper(r.coupon_code) === clean);
  if (!matching.length) return { error: "not_found" };

  const ids = [...new Set(matching.map((r) => r.offer_id))];
  const [offersRes, targetsRes, conditionsRes, binsRes, allRulesRes] = await Promise.all([
    admin.from("offers").select("*").in("id", ids),
    admin.from("offer_targets").select("offer_id, target_type, target_entity_id").in("offer_id", ids),
    admin.from("offer_conditions").select("offer_id, condition_type, operator, condition_value").in("offer_id", ids),
    admin.from("offer_bins").select("offer_id").in("offer_id", ids).eq("is_active", true),
    admin
      .from("offer_payment_rules")
      .select("offer_id, coupon_code, payment_instrument_type, card_network, issuer_bank_name, requires_saved_card")
      .in("offer_id", ids),
  ]);
  for (const res of [offersRes, targetsRes, conditionsRes, binsRes, allRulesRes]) if (res.error) throw res.error;

  const now = Date.now();
  let lastError = "not_here";
  const offers = (offersRes.data || []).sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));
  for (const offer of offers) {
    if (!offer.is_active || upper(offer.status) !== "ACTIVE") {
      lastError = "expired";
      continue;
    }
    if ((offer.starts_at && new Date(offer.starts_at).getTime() > now) || (offer.ends_at && new Date(offer.ends_at).getTime() < now)) {
      lastError = "expired";
      continue;
    }
    if (!["DINEIN", "BOTH"].includes(upper(offer.module)) || !SUPPORTED_TYPES.includes(upper(offer.offer_type))) continue;

    const targets = (targetsRes.data || []).filter((t) => t.offer_id === offer.id);
    const targeted =
      !targets.length ||
      targets.some((t) => upper(t.target_type) === "ALL" || (upper(t.target_type) === "RESTAURANT" && t.target_entity_id === restaurantId));
    if (!targeted) continue;

    const offerRules = (allRulesRes.data || []).filter((r) => r.offer_id === offer.id);
    const posUsable = offerRules.every(
      (r) =>
        (!r.coupon_code || upper(r.coupon_code) === clean) &&
        !r.payment_instrument_type &&
        (!r.card_network || upper(r.card_network) === "ANY") &&
        !r.issuer_bank_name &&
        !r.requires_saved_card
    );
    if (!posUsable || (binsRes.data || []).some((b) => b.offer_id === offer.id)) continue;

    if (offer.min_bill_amount != null && billCents < cents(offer.min_bill_amount)) {
      lastError = "min_bill";
      continue;
    }
    if (offer.max_bill_amount != null && billCents > cents(offer.max_bill_amount)) {
      lastError = "max_bill";
      continue;
    }
    const conditions = (conditionsRes.data || []).filter((c) => c.offer_id === offer.id);
    if (!conditions.every((c) => conditionOk(c, billCents))) continue;

    const discountCents = discountFor(offer, billCents);
    if (discountCents <= 0) continue;
    if (discountCents >= billCents) {
      lastError = "too_large";
      continue;
    }
    return {
      code: clean,
      offer_id: offer.id,
      title: offer.short_title || offer.title,
      funded_by: upper(offer.sponsor_type || offer.source_type) || "PLATFORM",
      discountCents,
    };
  }
  return { error: lastError };
}

export async function reservePromo(admin, restaurantId, orderId, quote, billCents, terminalId) {
  const { data, error } = await admin.rpc("pos_promo_reserve", {
    p_offer: quote.offer_id,
    p_restaurant: restaurantId,
    p_order: orderId,
    p_code: quote.code,
    p_original: billCents / 100,
    p_discount: quote.discountCents / 100,
    p_funded_by: quote.funded_by,
    p_terminal: terminalId || null,
    p_hold_minutes: HOLD_MINUTES,
  });
  if (error) throw error;
  return data?.ok ? { ok: true } : { error: data?.error || "promo_used" };
}

export async function heldPromo(admin, restaurantId, orderId) {
  const { data, error } = await admin
    .from("offer_redemptions")
    .select("id, offer_id, discount_amount, redemption_status, metadata")
    .eq("restaurant_id", restaurantId)
    .eq("order_reference", orderId)
    .eq("metadata->>source", "pos")
    .in("redemption_status", ["PENDING", "APPLIED"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function releasePromo(admin, restaurantId, orderId) {
  const { error } = await admin
    .from("offer_redemptions")
    .update({ redemption_status: "FAILED", updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("order_reference", orderId)
    .eq("metadata->>source", "pos")
    .eq("redemption_status", "PENDING");
  if (error) throw error;
}

export async function heldPromos(admin, restaurantId, orderIds) {
  if (!orderIds.length) return new Map();
  const { data, error } = await admin
    .from("offer_redemptions")
    .select("order_reference, discount_amount, metadata")
    .eq("restaurant_id", restaurantId)
    .eq("metadata->>source", "pos")
    .eq("redemption_status", "PENDING")
    .in("order_reference", orderIds);
  if (error) throw error;
  return new Map((data || []).map((r) => [r.order_reference, { code: r.metadata?.coupon_code, discount_cents: cents(r.discount_amount) }]));
}

export async function promoDue(admin, restaurantId) {
  const [dueRes, paidRes] = await Promise.all([
    admin
      .from("offer_redemptions")
      .select("discount_amount")
      .eq("restaurant_id", restaurantId)
      .eq("metadata->>source", "pos")
      .eq("redemption_status", "APPLIED")
      .is("settled_at", null)
      .in("metadata->>funded_by", ["PLATFORM", "CO_FUNDED"]),
    admin
      .from("promo_settlements")
      .select("id, amount, redemption_count, reference, paid_at")
      .eq("restaurant_id", restaurantId)
      .order("paid_at", { ascending: false })
      .limit(10),
  ]);
  if (dueRes.error) throw dueRes.error;
  if (paidRes.error) throw paidRes.error;
  const due = dueRes.data || [];
  return {
    due_cents: due.reduce((sum, r) => sum + cents(r.discount_amount), 0),
    due_count: due.length,
    settlements: paidRes.data || [],
  };
}

export async function promoHistory(admin, restaurantId) {
  const { data, error } = await admin
    .from("offer_redemptions")
    .select("id, order_reference, original_amount, discount_amount, final_amount, redeemed_at, settled_at, settlement_id, metadata")
    .eq("restaurant_id", restaurantId)
    .eq("metadata->>source", "pos")
    .eq("redemption_status", "APPLIED")
    .order("redeemed_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const rows = data || [];
  const ids = [...new Set(rows.map((r) => r.order_reference).filter(Boolean))];
  const { data: bills, error: billsErr } = ids.length
    ? await admin.from("restaurant_table_bookings").select("id, table_no").in("id", ids)
    : { data: [], error: null };
  if (billsErr) throw billsErr;
  const tables = new Map((bills || []).map((b) => [b.id, b.table_no]));
  return rows.map((r) => ({
    id: r.id,
    code: r.metadata?.coupon_code || null,
    funded_by: r.metadata?.funded_by || null,
    table_no: tables.get(r.order_reference) ?? null,
    bill: Number(r.original_amount),
    discount: Number(r.discount_amount),
    paid_by_guest: Number(r.final_amount),
    at: r.redeemed_at,
    settled_at: r.settled_at,
  }));
}
