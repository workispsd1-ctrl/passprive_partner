import { readJson, reply, requireTerminal, serverError } from "../_terminal";

function mapOfferRow(row) {
  const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const offerKind = meta.offerKind || "GENERAL";
  return {
    id: row.id,
    offerKind,
    title: row.title || "",
    description: row.description || "",
    promoCode: String(meta.promoCode || "").toUpperCase(),
    discountType: meta.discountType || (row.offer_type === "percentage" ? "PERCENT" : "FLAT"),
    discountValue: row.discount_value ?? "",
    startDate: meta.startDate || (row.start_at ? String(row.start_at).slice(0, 10) : ""),
    endDate: meta.endDate || (row.end_at ? String(row.end_at).slice(0, 10) : ""),
    slotStart: meta.slotStart || "",
    slotEnd: meta.slotEnd || "",
    weekdays: Array.isArray(meta.weekdays) ? meta.weekdays : [],
    isActive: Boolean(row.is_active),
    conditions: {
      minGuests: meta.conditions?.minGuests ?? "",
      minBillAmount: meta.conditions?.minBillAmount ?? row.min_spend ?? "",
      newUsersOnly: Boolean(meta.conditions?.newUsersOnly),
    },
    visitRewards: {
      enabled: Boolean(meta.visitRewards?.enabled || offerKind === "VISIT"),
      tiers: Array.isArray(meta.visitRewards?.tiers) ? meta.visitRewards.tiers : [],
    },
    dishDiscount: {
      dishId: meta.dishDiscount?.dishId || "",
      dishName: meta.dishDiscount?.dishName || "",
      sectionId: meta.dishDiscount?.sectionId || "",
      sectionName: meta.dishDiscount?.sectionName || "",
    },
  };
}

// Staff devices can only read offers. Creating, changing and deleting offers stays in the owner's
// dashboard, and there are no paid upgrades any more.
export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;

    const body = await readJson(request);
    if (body.action && body.action !== "load") return reply({ ok: false, error: "not_allowed" }, 403);

    const { data, error } = await admin
      .from("restaurant_offers")
      .select("id, title, description, offer_type, discount_value, min_spend, start_at, end_at, is_active, metadata, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    if (error) return serverError(error);

    return reply({
      ok: true,
      offers: (data || []).map(mapOfferRow),
      premium_access: { unlock_all: true, time_slot: true, repeat_rewards: true, discounts: true },
    });
  } catch (error) {
    return serverError(error);
  }
}
