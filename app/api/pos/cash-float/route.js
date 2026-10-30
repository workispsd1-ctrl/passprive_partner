import { mauritiusDayRange } from "@/lib/server/billHistory";
import { loadSales } from "@/lib/server/tillStats";
import { readJson, reply, requireTerminal, serverError } from "../../staff/_terminal";

const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;
const COLUMNS = "day, opening_cents, opened_at, closing_cents, expected_cents, closed_at";

function cashCents(sales) {
  return sales.reduce((sum, sale) => {
    if (sale.split) {
      return sum + sale.split.filter((p) => String(p.method).toUpperCase() === "CASH").reduce((s, p) => s + Math.round(Number(p.amount || 0) * 100), 0);
    }
    return sale.method === "CASH" ? sum + sale.amount : sum;
  }, 0);
}

function validCents(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : null;
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId } = ctx;
    const body = await readJson(request);
    const day = new Date(Date.now() + MAURITIUS_OFFSET_MS).toISOString().slice(0, 10);
    const { start, end } = mauritiusDayRange(day);
    const action = String(body.action || "get");

    const [floatRes, { sales }] = await Promise.all([
      admin.from("cash_floats").select(COLUMNS).eq("restaurant_id", restaurantId).eq("day", day).maybeSingle(),
      loadSales(admin, restaurantId, start, end),
    ]);
    if (floatRes.error) throw floatRes.error;
    const cash = cashCents(sales);
    let float = floatRes.data;

    if (action === "open") {
      const opening = validCents(body.opening_cents);
      if (opening === null) return reply({ ok: false, error: "invalid_amount" }, 400);
      if (float) return reply({ ok: false, error: "already_open" }, 409);
      const { data, error } = await admin
        .from("cash_floats")
        .insert({ restaurant_id: restaurantId, day, opening_cents: opening, opened_by: terminalId })
        .select(COLUMNS)
        .single();
      if (error?.code === "23505") return reply({ ok: false, error: "already_open" }, 409);
      if (error) throw error;
      float = data;
    } else if (action === "close") {
      const counted = validCents(body.closing_cents);
      if (counted === null) return reply({ ok: false, error: "invalid_amount" }, 400);
      if (!float) return reply({ ok: false, error: "not_open" }, 409);
      const { data, error } = await admin
        .from("cash_floats")
        .update({ closing_cents: counted, expected_cents: float.opening_cents + cash, closed_at: new Date().toISOString(), closed_by: terminalId })
        .eq("restaurant_id", restaurantId)
        .eq("day", day)
        .is("closed_at", null)
        .select(COLUMNS);
      if (error) throw error;
      if (!data?.length) return reply({ ok: false, error: "already_closed" }, 409);
      float = data[0];
    } else if (action !== "get") {
      return reply({ ok: false, error: "invalid_action" }, 400);
    }

    return reply({ ok: true, day, float, cash_cents: cash });
  } catch (error) {
    return serverError(error);
  }
}
