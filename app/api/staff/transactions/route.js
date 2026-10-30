import { NextResponse } from "next/server";
import { mauritiusDayRange } from "@/lib/server/billHistory";
import { readJson, requireTerminal, serverError } from "../_terminal";

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
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId } = ctx;
    const body = await readJson(request);
    const range = String(body?.range || "30").trim();

    const seriesDays = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : null;
    const dayRange = body?.date ? mauritiusDayRange(body.date) : null;
    if (body?.date && !dayRange) return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
    const fromIso = dayRange?.start || (seriesDays ? daysAgoUTC(seriesDays - 1).toISOString() : null);

    let query = admin
      .from("payment_sessions")
      .select(
        "id,tracking_id,restaurant_id,payment_context,payment_provider,amount_major,currency_code,status,gateway_status,created_at,updated_at"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (fromIso) query = query.gte("created_at", fromIso);
    if (dayRange) query = query.lt("created_at", dayRange.end);

    const { data: rows, error: psErr } = await query;
    if (psErr) return serverError(psErr);

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
    return serverError(error);
  }
}
