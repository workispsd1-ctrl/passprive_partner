import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const supabase = serverClient();
    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const userId = userRes.user.id;

    const [ownerRes, staffRes] = await Promise.all([
      admin.from("restaurants").select("id,name").eq("owner_user_id", userId).order("name", { ascending: true }),
      admin
        .from("restaurant_staff")
        .select("restaurant_id, restaurants:restaurant_id(id,name)")
        .eq("user_id", userId),
    ]);

    if (ownerRes.error) throw ownerRes.error;
    if (staffRes.error) throw staffRes.error;

    const ownerRestaurants = ownerRes.data || [];
    const staffRestaurants = (staffRes.data || [])
      .map((r) => (Array.isArray(r.restaurants) ? r.restaurants[0] : r.restaurants))
      .filter(Boolean);

    const merged = new Map();
    [...ownerRestaurants, ...staffRestaurants].forEach((r) => merged.set(String(r.id), r));
    const restaurants = Array.from(merged.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    const restaurantIds = restaurants.map((r) => r.id);
    if (!restaurantIds.length) {
      return NextResponse.json({ ok: true, restaurants: [], transactions: [] });
    }

    const psRes = await admin
      .from("payment_sessions")
      .select(
        "id,tracking_id,restaurant_id,payment_context,payment_provider,amount_major,currency_code,status,gateway_status,created_at,updated_at"
      )
      .in("restaurant_id", restaurantIds)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (psRes.error) throw psRes.error;

    const transactions = (psRes.data || []).map((r) => ({
      id: r.tracking_id || String(r.id),
      restaurant_id: r.restaurant_id,
      total_amount: Number(r.amount_major || 0),
      payment_method: String(r.payment_provider || "ONLINE").toUpperCase(),
      payment_status: String(r.status || "PENDING").toUpperCase(),
      status: String(r.gateway_status || r.status || "PENDING").toUpperCase(),
      created_at: r.created_at,
      updated_at: r.updated_at,
      source: String(r.payment_context || "BILL_PAYMENT").toUpperCase(),
      currency_code: r.currency_code || "MUR",
    }));

    return NextResponse.json({ ok: true, restaurants, transactions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load transactions" }, { status: 500 });
  }
}

