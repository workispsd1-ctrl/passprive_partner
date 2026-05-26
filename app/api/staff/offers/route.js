import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

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

function serializeOffer(restaurantId, offer) {
  const kind = offer.offerKind || "GENERAL";
  const discountType = offer.discountType || "FLAT";
  const hasDiscount = offer.discountValue !== "" && offer.discountValue != null;
  const numericDiscount = hasDiscount ? Number(offer.discountValue) : null;

  return {
    restaurant_id: restaurantId,
    title:
      kind === "VISIT"
        ? "Visit rewards"
        : String(offer.title || "").trim() || "Untitled offer",
    description: String(offer.description || "").trim() || null,
    badge_text: null,
    offer_type:
      kind === "VISIT" ? "custom" : discountType === "PERCENT" ? "percentage" : "flat",
    discount_value: Number.isFinite(numericDiscount) ? numericDiscount : null,
    min_spend:
      offer.conditions?.minBillAmount === "" || offer.conditions?.minBillAmount == null
        ? null
        : Number(offer.conditions.minBillAmount),
    start_at: offer.startDate ? `${offer.startDate}T00:00:00` : null,
    end_at: offer.endDate ? `${offer.endDate}T23:59:59` : null,
    is_active: Boolean(offer.isActive),
    metadata: {
      offerKind: kind,
      promoCode: String(offer.promoCode || "").toUpperCase(),
      discountType,
      startDate: offer.startDate || "",
      endDate: offer.endDate || "",
      slotStart: offer.slotStart || "",
      slotEnd: offer.slotEnd || "",
      weekdays: Array.isArray(offer.weekdays) ? offer.weekdays : [],
      conditions: {
        minGuests: offer.conditions?.minGuests ?? "",
        minBillAmount: offer.conditions?.minBillAmount ?? "",
        newUsersOnly: Boolean(offer.conditions?.newUsersOnly),
      },
      visitRewards: {
        enabled: Boolean(offer.visitRewards?.enabled),
        tiers: Array.isArray(offer.visitRewards?.tiers) ? offer.visitRewards.tiers : [],
      },
      dishDiscount: {
        dishId: offer.dishDiscount?.dishId || "",
        dishName: offer.dishDiscount?.dishName || "",
        sectionId: offer.dishDiscount?.sectionId || "",
        sectionName: offer.dishDiscount?.sectionName || "",
      },
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();
    const action = String(body?.action || "load").trim();

    if (!restaurantId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "restaurant_id and device_id are required" },
        { status: 400 }
      );
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." },
        { status: 500 }
      );
    }

    // Verify device is paired
    const { data: deviceRow, error: deviceErr } = await admin
      .from("restaurant_staff_devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();

    if (deviceErr) return NextResponse.json({ ok: false, error: deviceErr.message }, { status: 400 });
    if (!deviceRow?.device_id) {
      return NextResponse.json({ ok: false, error: "Device not authorized." }, { status: 403 });
    }

    // ── SAVE ──────────────────────────────────────────────────────────────────
    if (action === "save") {
      const offers = Array.isArray(body?.offers) ? body.offers : [];

      const { error: deleteErr } = await admin
        .from("restaurant_offers")
        .delete()
        .eq("restaurant_id", restaurantId);
      if (deleteErr) return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 400 });

      if (offers.length > 0) {
        const payload = offers.map((o) => serializeOffer(restaurantId, o));
        const { error: insertErr } = await admin.from("restaurant_offers").insert(payload);
        if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    // ── LOAD ──────────────────────────────────────────────────────────────────
    const [offersRes, subscriptionRes] = await Promise.all([
      admin
        .from("restaurant_offers")
        .select(
          "id, title, description, offer_type, discount_value, min_spend, start_at, end_at, is_active, metadata, created_at"
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      admin
        .from("restaurant_subscriptions")
        .select(
          "id, plan_code, status, unlock_all, time_slot_enabled, repeat_rewards_enabled, dish_discounts_enabled"
        )
        .eq("restaurant_id", restaurantId)
        .in("status", ["active", "trial"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (offersRes.error) return NextResponse.json({ ok: false, error: offersRes.error.message }, { status: 400 });

    const subscription = subscriptionRes.data || null;
    const unlockAll = Boolean(subscription?.unlock_all);

    return NextResponse.json({
      ok: true,
      offers: (offersRes.data || []).map(mapOfferRow),
      premium_access: {
        unlock_all: unlockAll,
        time_slot: Boolean(subscription?.time_slot_enabled || unlockAll),
        repeat_rewards: Boolean(subscription?.repeat_rewards_enabled || unlockAll),
        discounts: Boolean(subscription?.dish_discounts_enabled || unlockAll),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
