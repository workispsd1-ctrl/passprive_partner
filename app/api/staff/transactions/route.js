import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

function startOfDayUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysAgoUTC(n) {
  const d = startOfDayUTC(new Date());
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

const INVALID_STATUSES = ["VERIFIED_FAILED", "ERROR"];

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const deviceId = String(body?.device_id || "").trim();
    const range = String(body?.range || "30").trim();

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

    const seriesDays = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : null;
    const fromIso = seriesDays ? daysAgoUTC(seriesDays - 1).toISOString() : null;

    let query = admin
      .from("payment_sessions")
      .select(
        "id,tracking_id,restaurant_id,payment_context,payment_provider,amount_major,currency_code,status,gateway_status,created_at,updated_at"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (fromIso) query = query.gte("created_at", fromIso);

    const { data: rows, error: psErr } = await query;
    if (psErr) return NextResponse.json({ ok: false, error: psErr.message }, { status: 400 });

    const transactions = (rows || []).map((r) => ({
      id: r.tracking_id || String(r.id),
      raw_id: String(r.id),
      restaurant_id: r.restaurant_id,
      total_amount: Number(r.amount_major || 0),
      payment_method: String(r.payment_provider || "ONLINE").toUpperCase(),
      payment_status: String(r.status || "PENDING").toUpperCase(),
      gateway_status: String(r.gateway_status || r.status || "PENDING").toUpperCase(),
      source: String(r.payment_context || "BILL_PAYMENT").toUpperCase(),
      currency_code: r.currency_code || "MUR",
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    // Summary stats (same logic as web app)
    let businessMade = 0;
    let cashReceived = 0;
    let onlineCollected = 0;
    let totalTransactions = 0;

    for (const t of transactions) {
      if (INVALID_STATUSES.includes(t.payment_status)) continue;
      const amount = t.total_amount;
      businessMade += amount;
      totalTransactions += 1;
      if (t.payment_status !== "CANCELLED") {
        onlineCollected += amount;
      } else {
        cashReceived += amount;
      }
    }

    return NextResponse.json({
      ok: true,
      transactions,
      summary: { businessMade, cashReceived, onlineCollected, totalTransactions },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
