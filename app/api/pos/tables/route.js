import { addBillItems, seatTable, setBillItemQty } from "@/lib/server/billItems";
import { settleTableBill } from "@/lib/server/settleBill";
import { claimPrintJob, pendingPrintJobs, releasePrintJob } from "@/lib/server/printJobs";
import { isBillClosed } from "@/lib/server/tableBill";
import { readJson, reply, requireTerminal, serverError } from "../../staff/_terminal";

const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";
const THUMB_WIDTH = 320;
const COMPLETABLE = ["PLACED", "CONFIRMED", "PREPARING", "SERVED"];
const ORDER_COLUMNS =
  "id, table_no, guest_count, customer_name, notes, booking_status, payment_status, subtotal_amount, total_amount, order_items, created_at, updated_at, source";

function thumbnail(urls) {
  const url = Array.isArray(urls) ? String(urls[0] || "") : "";
  if (!url.startsWith("http")) return "";
  return url.includes(STORAGE_OBJECT_PATH)
    ? `${url.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH)}?width=${THUMB_WIDTH}&quality=60`
    : url;
}

function menuSections(menuJson) {
  let menu = menuJson;
  if (typeof menu === "string") {
    try {
      menu = JSON.parse(menu);
    } catch {
      menu = null;
    }
  }
  return (Array.isArray(menu?.sections) ? menu.sections : [])
    .map((section) => ({
      id: String(section?.id || section?.name || ""),
      name: String(section?.name || ""),
      group: String(section?.group || "").trim() || "Other",
      items: (Array.isArray(section?.items) ? section.items : [])
        .filter((item) => item?.id && item.is_available !== false)
        .map((item) => ({
          id: String(item.id),
          name: String(item.name || ""),
          price: Number(item.price || 0),
          image: thumbnail(item.image_urls),
        })),
    }))
    .filter((section) => section.items.length > 0);
}

async function liveTables({ admin, restaurantId }) {
  const [tablesRes, ordersRes, merchantRes, printJobs] = await Promise.all([
    admin
      .from("restaurant_table_layouts")
      .select("table_no, label, capacity")
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
    admin
      .from("restaurants")
      .select("name, registered_name, brn, full_address, phone")
      .eq("id", restaurantId)
      .maybeSingle(),
    pendingPrintJobs(admin, restaurantId).catch(() => []),
  ]);
  if (tablesRes.error) throw tablesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  return {
    merchant: merchantRes.data || null,
    print_jobs: printJobs,
    tables: tablesRes.data || [],
    orders: (ordersRes.data || [])
      .filter((o) => !isBillClosed(o)),
  };
}

async function isReadyToPay({ admin, restaurantId }, orderId) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .select("booking_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return ["SERVED", "COMPLETED"].includes(String(data?.booking_status || "").toUpperCase());
}

async function advanceStatus({ admin, restaurantId }, orderId) {
  const { data: row, error } = await admin
    .from("restaurant_table_bookings")
    .select("id, booking_status, payment_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  const status = String(row?.booking_status || "").toUpperCase();
  if (!row?.id || !COMPLETABLE.includes(status) || isBillClosed(row)) return false;
  const { error: upErr } = await admin
    .from("restaurant_table_bookings")
    .update({ booking_status: "COMPLETED", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("booking_status", row.booking_status);
  if (upErr) throw upErr;
  return true;
}

async function reopenBill({ admin, restaurantId }, orderId) {
  const { data, error } = await admin
    .from("restaurant_table_bookings")
    .update({ booking_status: "PREPARING", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("booking_status", ["SERVED", "COMPLETED"])
    .not("payment_status", "in", "(PAID,COMPLETED)")
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
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

    if (action === "reopen") {
      const ok = await reopenBill(ctx, String(body.order_id || ""));
      return ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply({ ok: false, error: "invalid_status" }, 409);
    }

    if (action === "set_item_qty") {
      const { status, body: out } = await setBillItemQty(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "menu") {
      const { data, error } = await ctx.admin
        .from("restaurants")
        .select("menu_json")
        .eq("id", ctx.restaurantId)
        .maybeSingle();
      if (error) throw error;
      return reply({ ok: true, sections: menuSections(data?.menu_json) });
    }

    if (action === "seat") {
      const { status, body: out } = await seatTable(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return reply(out, status);
    }

    if (action === "add_items") {
      const { status, body: out } = await addBillItems(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "claim_print") {
      const ok = await claimPrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""));
      return reply({ ok: true, claimed: ok });
    }

    if (action === "release_print") {
      await releasePrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""));
      return reply({ ok: true });
    }

    if (action === "settle") {
      if (!body.gateway && !(await isReadyToPay(ctx, String(body.order_id || "")))) {
        return reply({ ok: false, error: "Mark this table completed first." }, 409);
      }
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
