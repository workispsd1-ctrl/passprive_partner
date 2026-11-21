import { addBillItems, seatTable, setBillItemQty } from "@/lib/server/billItems";
import { settleTableBill } from "@/lib/server/settleBill";
import { payBillPart } from "@/lib/server/splitBill";
import { finishDiscovery, pendingDiscovery } from "@/lib/server/printerDiscovery";
import { activePrinters, claimPrintJob, confirmPrintJob, isQrPending, leasePrintJob, pendingPrintJobs, releasePrintJob, TICKET_KINDS, unleasePrintJob } from "@/lib/server/printJobs";
import { cancelPayRequest, pendingPayRequests } from "@/lib/server/payRequests";
import { heldPromos, PROMO_ERRORS, promoDue, promoLocked, quotePromo, recordPromoAttempt, releasePromo, reservePromo } from "@/lib/server/promoCode";
import { isBillClosed } from "@/lib/server/tableBill";
import { readJson, reply, requireTerminal, serverError } from "../../staff/_terminal";
import { publicModifierGroups, publicSubcategories, publicVariants } from "@/lib/server/menuPricing";
import { menuAreas, menuTabs, sectionTab } from "@/lib/menuAreas";
import { isSoldOut } from "@/lib/soldOut";

const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";
const THUMB_WIDTH = 320;
const COMPLETABLE = ["PLACED", "CONFIRMED", "PREPARING", "SERVED"];
const PAID_ONLINE_HOURS = 12;

function isPaidOnline(o) {
  return o?.source === "public_menu" && ["PAID", "COMPLETED"].includes(String(o?.payment_status || "").toUpperCase());
}
const ORDER_COLUMNS =
  "id, table_no, guest_count, customer_name, notes, booking_status, payment_status, subtotal_amount, total_amount, tip_amount, order_items, created_at, updated_at, source, qr_pending:order_details->qr_pending, payments:order_details->payments";

function thumbnail(urls) {
  const url = Array.isArray(urls) ? String(urls[0] || "") : "";
  if (!url.startsWith("http")) return "";
  return url.includes(STORAGE_OBJECT_PATH)
    ? `${url.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH)}?width=${THUMB_WIDTH}&quality=60`
    : url;
}

function parseMenuJson(menuJson) {
  if (typeof menuJson !== "string") return menuJson;
  try {
    return JSON.parse(menuJson);
  } catch {
    return null;
  }
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
  const presets = (list) =>
    (Array.isArray(list) ? list : []).map((v) => String(v || "").trim().slice(0, 60)).filter(Boolean);
  const everyItem = presets(menu?.comment_presets);
  const areas = menuAreas(menu);
  const labels = new Map(menuTabs(areas).map((t) => [t.key, t.label]));
  return (Array.isArray(menu?.sections) ? menu.sections : [])
    .map((section) => ({
      id: String(section?.id || section?.name || ""),
      name: String(section?.name || ""),
      group: labels.get(sectionTab(areas, section)) || "Kitchen",
      comment_presets: [...new Set([...presets(section?.comment_presets), ...everyItem])].slice(0, 30),
      subcategories: publicSubcategories(section),
      items: (Array.isArray(section?.items) ? section.items : [])
        .filter((item) => item?.id && item.is_available !== false && !isSoldOut(item) && (!(item.variants || []).length || publicVariants(item).length))
        .map((item) => {
          const groups = publicModifierGroups(item);
          const variants = publicVariants(item);
          return {
            id: String(item.id),
            name: String(item.name || ""),
            price: Number(item.price || 0),
            image: thumbnail(item.image_urls),
            subcategory_id: item.subcategory_id ? String(item.subcategory_id) : null,
            ...(groups.length ? { modifier_groups: groups } : {}),
            ...(variants.length ? { variants, price: Math.min(...variants.map((v) => v.price)) } : {}),
          };
        }),
    }))
    .filter((section) => section.items.length > 0);
}

async function liveTables({ admin, restaurantId, printKinds, lan = false }) {
  const [tablesRes, ordersRes, merchantRes, printJobs, payRequests, printers, discovery] = await Promise.all([
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
      .or(`payment_status.not.in.(PAID,COMPLETED),and(source.eq.public_menu,booking_status.neq.COMPLETED,created_at.gte.${new Date(Date.now() - PAID_ONLINE_HOURS * 3600000).toISOString()})`)
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from("restaurants")
      .select("name, registered_name, brn, full_address, phone")
      .eq("id", restaurantId)
      .maybeSingle(),
    pendingPrintJobs(admin, restaurantId, printKinds, lan).catch(() => []),
    pendingPayRequests(admin, restaurantId).catch(() => []),
    lan ? activePrinters(admin, restaurantId).catch(() => []) : Promise.resolve([]),
    lan ? pendingDiscovery(admin, restaurantId).catch(() => []) : Promise.resolve([]),
  ]);
  if (tablesRes.error) throw tablesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  const orders = (ordersRes.data || []).filter((o) => !isQrPending(o) && (!isBillClosed(o) || isPaidOnline(o)));
  const promos = await heldPromos(admin, restaurantId, orders.map((o) => o.id));
  return {
    merchant: merchantRes.data || null,
    print_jobs: printJobs,
    printers: printers.map((p) => ({ id: p.id, name: p.name, ip: p.ip, port: p.port, paper_mm: p.paper_mm, prints: p.prints, backup_printer_id: p.backup_printer_id || null })),
    discovery,
    pay_requests: payRequests,
    tables: tablesRes.data || [],
    orders: orders.map((o) => (promos.has(o.id) ? { ...o, promo: promos.get(o.id) } : o)),
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
    .select("id, booking_status, payment_status, source")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  const status = String(row?.booking_status || "").toUpperCase();
  if (!row?.id || !COMPLETABLE.includes(status) || (isBillClosed(row) && !isPaidOnline(row))) return false;
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
    const accepted = Array.isArray(body.print_kinds) ? body.print_kinds.map(String) : [];
    ctx.printKinds = [...new Set([...TICKET_KINDS, ...accepted.filter((k) => ["bill", "part_receipt", "final_bill", "test"].includes(k))])];
    ctx.lan = body.lan_print === true;
    if (ctx.lan) {
      const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      await ctx.admin
        .from("pos_terminals")
        .update({ lan_print_at: new Date().toISOString(), ...(body.discovery === true ? { discovery_at: new Date().toISOString() } : {}) })
        .eq("id", ctx.terminalId)
        .or(`lan_print_at.is.null,lan_print_at.lt.${minuteAgo}`);
    }

    if (action === "decline_payment") {
      const { status, body: out } = await cancelPayRequest(ctx.admin, ctx.restaurantId, ctx.userId, body, "declined");
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

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
      return reply({ ok: true, sections: menuSections(data?.menu_json), menus: menuTabs(menuAreas(parseMenuJson(data?.menu_json))).map((t) => t.label) });
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

    if (action === "discovery_result") {
      await finishDiscovery(ctx.admin, ctx.restaurantId, ctx.terminalId, body);
      return reply({ ok: true });
    }

    if (action === "lease_print") {
      const ok = await leasePrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""));
      return reply({ ok: true, leased: ok });
    }

    if (action === "confirm_print") {
      await confirmPrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""), body.printer_id || null);
      return reply({ ok: true });
    }

    if (action === "unlease_print") {
      await unleasePrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""));
      return reply({ ok: true });
    }

    if (action === "release_print") {
      await releasePrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""));
      return reply({ ok: true });
    }

    if (action === "promo_apply") {
      const orderId = String(body.order_id || "");
      const { data: row, error } = await ctx.admin
        .from("restaurant_table_bookings")
        .select("id, total_amount, booking_status, payment_status, payments:order_details->payments")
        .eq("id", orderId)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle();
      if (error) throw error;
      if (!row || isBillClosed(row)) return reply({ ok: false, error: "This bill is already closed." }, 409);
      if (Array.isArray(row.payments) && row.payments.length) {
        return reply({ ok: false, error: "Part of this bill is already paid, so a promo code can't be added." }, 409);
      }
      const billCents = Math.round(Number(row.total_amount || 0) * 100);
      if (await promoLocked(ctx.admin, ctx.restaurantId, ctx.terminalId)) {
        return reply({ ok: false, error: PROMO_ERRORS.locked }, 429);
      }
      const quote = await quotePromo(ctx.admin, ctx.restaurantId, body.code, billCents);
      const guessed = quote.error === "not_found" || quote.error === "not_here" || quote.error === "invalid_code";
      await recordPromoAttempt(ctx.admin, ctx.restaurantId, ctx.terminalId, !guessed);
      if (quote.error) return reply({ ok: false, error: PROMO_ERRORS[quote.error] }, 409);
      const reserved = await reservePromo(ctx.admin, ctx.restaurantId, orderId, quote, billCents, ctx.terminalId);
      if (reserved.error) return reply({ ok: false, error: PROMO_ERRORS[reserved.error] }, 409);
      return reply({
        ok: true,
        promo: { code: quote.code, title: quote.title, discount_cents: quote.discountCents },
        ...(await liveTables(ctx)),
      });
    }

    if (action === "promo_remove") {
      await releasePromo(ctx.admin, ctx.restaurantId, String(body.order_id || ""));
      return reply({ ok: true, ...(await liveTables(ctx)) });
    }

    if (action === "promo_due") return reply({ ok: true, ...(await promoDue(ctx.admin, ctx.restaurantId)) });

    if (action === "pay_part") {
      if (!body.gateway && !body.request_id && !(await isReadyToPay(ctx, String(body.order_id || "")))) {
        return reply({ ok: false, error: "Mark this table completed first." }, 409);
      }
      const { status, body: out } = await payBillPart(ctx.admin, ctx.restaurantId, ctx.userId, body, ctx.terminalId);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "settle") {
      if (!body.gateway && !(await isReadyToPay(ctx, String(body.order_id || "")))) {
        return reply({ ok: false, error: "Mark this table completed first." }, 409);
      }
      const { status, body: out } = await settleTableBill(
        ctx.admin,
        ctx.restaurantId,
        ctx.userId,
        {
          ...body,
          gateway: body.gateway ? { ...body.gateway, terminal_id: ctx.terminalId } : undefined,
        },
        ctx.terminalId
      );
      return reply(out, status);
    }

    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
