import { settleTableBill } from "@/lib/server/settleBill";
import { isBillClosed } from "@/lib/server/tableBill";
import { readJson, reply, requireTerminal, serverError } from "../../staff/_terminal";

const NEXT_STATUS = { PLACED: "PREPARING", CONFIRMED: "PREPARING", PREPARING: "SERVED" };
const ORDER_COLUMNS =
  "id, table_no, guest_count, customer_name, booking_status, payment_status, subtotal_amount, total_amount, order_items, created_at, updated_at, source";

async function liveTables({ admin, restaurantId }) {
  const [tablesRes, ordersRes] = await Promise.all([
    admin
      .from("restaurant_table_layouts")
      .select("table_no, label")
      .eq("restaurant_id", restaurantId)
      .order("table_no", { ascending: true }),
    admin
      .from("restaurant_table_bookings")
      .select(ORDER_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .not("booking_status", "in", "(CANCELLED,PAID)")
      .not("payment_status", "in", "(PAID,COMPLETED)")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (tablesRes.error) throw tablesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  return {
    tables: tablesRes.data || [],
    orders: (ordersRes.data || [])
      .filter((o) => !isBillClosed(o)),
  };
}

async function advanceStatus({ admin, restaurantId }, orderId) {
  const { data: row, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, booking_status, payment_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  const next = NEXT_STATUS[String(row?.booking_status || "").toUpperCase()];
  if (!row?.id || !next || isBillClosed(row)) return false;
  const { error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({ booking_status: next, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("booking_status", row.booking_status);
  if (upErr) throw upErr;
  return true;
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    const body = await readJson(request);
    const action = String(body.action || "list");

    if (action === "list") return reply({ ok: true, ...(await liveTables(ctx)) });

    if (action === "advance") {
      const ok = await advanceStatus(ctx, String(body.order_id || ""));
      return ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply({ ok: false, error: "invalid_status" }, 409);
    }

    if (action === "settle") {
      const { status, body: out } = await settleTableBill(ctx.admin, ctx.restaurantId, ctx.userId, {
        ...body,
        gateway: body.gateway ? { ...body.gateway, terminal_id: ctx.terminalId } : undefined,
      });
      return reply(out, status);
    }

    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
