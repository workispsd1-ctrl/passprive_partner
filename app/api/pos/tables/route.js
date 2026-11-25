import { listWaiters, resolveWaiter, WAITER_ROLES } from "@/lib/server/waiters";
import { changeTable } from "@/lib/server/changeTable";
import { logoStamp } from "@/lib/server/receiptLogo";
import { addBillItems, cancelBillItems, seatTable, setBillItemQty, setCovers, voidTable } from "@/lib/server/billItems";
import { addGuest, setItemGuest } from "@/lib/server/billGuests";
import { settleTableBill } from "@/lib/server/settleBill";
import { closeOnDeposit, payBillPart } from "@/lib/server/splitBill";
import { finishDiscovery, pendingDiscovery } from "@/lib/server/printerDiscovery";
import { activePrinters, claimPrintJob, confirmPrintJob, failPrintJob, isQrPending, leasePrintJob, pendingPrintJobs, printHistory, queueBillPrint, queueFinalPrint, queuePartPrint, RECEIPT_KINDS, releasePrintJob, reprintJob, TICKET_KINDS, unleasePrintJob } from "@/lib/server/printJobs";
import { setDiscount } from "@/lib/server/billDiscount";
import { createBooking } from "@/lib/server/bookingCreate";
import { cancelPaidBill, correctMethod, printCorrected, reopenPaidBill } from "@/lib/server/billCorrection";
import { accountDetail, listAccounts, printStatement, settleAccount } from "@/lib/server/customerAccounts";
import { cancelPayRequest, claimPayRequest, failPayRequest, pendingPayRequests, retryPayRequest } from "@/lib/server/payRequests";
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
  "id, table_no, guest_count, customer_name, notes, invoice_no, booking_status, payment_status, subtotal_amount, total_amount, tip_amount, order_items, created_at, updated_at, source, qr_pending:order_details->qr_pending, payments:order_details->payments, guests:order_details->guests, bill_discount:order_details->bill_discount, opened_by:order_details->opened_by";

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

const POS_BACKUP_MS = 20 * 1000;

async function liveTables({ admin, restaurantId, printKinds, lan = false }) {
  const [tablesRes, ordersRes, merchantRes, printJobs, payRequests, printers, discovery, logoAt] = await Promise.all([
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
      .select("name, registered_name, brn, vat_number, full_address, phone")
      .eq("id", restaurantId)
      .maybeSingle(),
    pendingPrintJobs(admin, restaurantId, printKinds, lan, { minAgeMs: POS_BACKUP_MS }).catch(() => []),
    pendingPayRequests(admin, restaurantId).catch(() => []),
    lan ? activePrinters(admin, restaurantId).catch(() => []) : Promise.resolve([]),
    lan ? pendingDiscovery(admin, restaurantId).catch(() => []) : Promise.resolve([]),
    logoStamp(admin, restaurantId).catch(() => null),
  ]);
  if (tablesRes.error) throw tablesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  const orders = (ordersRes.data || []).filter((o) => !isQrPending(o) && (!isBillClosed(o) || isPaidOnline(o)));
  const promos = await heldPromos(admin, restaurantId, orders.map((o) => o.id));
  return {
    restaurant_id: restaurantId,
    merchant: merchantRes.data ? { ...merchantRes.data, ...(logoAt ? { logo_at: logoAt } : {}) } : null,
    print_jobs: printJobs,
    printers: printers.map((p) => ({ id: p.id, name: p.name, ip: p.ip, port: p.port, paper_mm: p.paper_mm, prints: p.prints, backup_printer_id: p.backup_printer_id || null, bottom_feed_mm: p.bottom_feed_mm || 0 })),
    discovery,
    pay_requests: payRequests,
    tables: tablesRes.data || [],
    orders: orders.map((o) => (promos.has(o.id) ? { ...o, promo: promos.get(o.id) } : o)),
    waiters: await listWaiters(admin, restaurantId).catch(() => []),
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
    ctx.printKinds = [...new Set(accepted.filter((k) => [...TICKET_KINDS, ...RECEIPT_KINDS, "test"].includes(k)))];
    ctx.lan = body.lan_print === true;
    if (ctx.lan) {
      const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      await ctx.admin
        .from("pos_terminals")
        .update({ lan_print_at: new Date().toISOString(), ...(body.discovery === true ? { discovery_at: new Date().toISOString() } : {}) })
        .eq("id", ctx.terminalId)
        .or(`lan_print_at.is.null,lan_print_at.lt.${minuteAgo}`);
    }

    if (action === "claim_request") {
      const { status, body: out } = await claimPayRequest(ctx.admin, ctx.restaurantId, ctx.terminalId, body.request_id);
      return reply(out, status);
    }

    if (action === "accounts_list") {
      const { status, body: out } = await listAccounts(ctx.admin, ctx.restaurantId, { q: body?.q || "" });
      return reply(out, status);
    }

    if (action === "account_detail") {
      const { status, body: out } = await accountDetail(ctx.admin, ctx.restaurantId, body?.account_id);
      return reply(out, status);
    }

    if (action === "account_statement") {
      const { status, body: out } = await printStatement(ctx.admin, ctx.restaurantId, body?.account_id, body?.lang === "fr" ? "fr" : "en");
      return reply(out, status);
    }

    if (action === "settle_account") {
      const { status, body: out } = await settleAccount(ctx.admin, ctx.restaurantId, ctx.userId, body, { terminalId: ctx.terminalId });
      return reply(out, status);
    }

    if (action === "correct_method") {
      const { status, body: out } = await correctMethod(ctx.admin, ctx.restaurantId, ctx.userId, body);
      if (out.ok && body?.print !== false) {
        await printCorrected(ctx.admin, ctx.restaurantId, body?.kind, String(body?.order_id || "")).catch((e) => console.error("corrected bill print failed", e?.message));
      }
      return reply(out, status);
    }

    if (action === "reopen_paid") {
      const { status, body: out } = await reopenPaidBill(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "cancel_paid") {
      const { status, body: out } = await cancelPaidBill(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "create_booking") {
      const { status, body: out } = await createBooking(ctx, body);
      return reply(out, status);
    }

    if (action === "set_discount") {
      const { status, body: out } = await setDiscount(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "fail_request") {
      const { status, body: out } = await failPayRequest(ctx.admin, ctx.restaurantId, ctx.terminalId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "retry_request") {
      const { status, body: out } = await retryPayRequest(ctx.admin, ctx.restaurantId, ctx.terminalId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "decline_payment") {
      const { status, body: out } = await cancelPayRequest(ctx.admin, ctx.restaurantId, ctx.userId, body, "declined", ctx.terminalId);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "list") return reply({ ok: true, ...(await liveTables(ctx)) });

    if (action === "advance") {
      const ok = await advanceStatus(ctx, String(body.order_id || ""));
      if (ok) await queueBillPrint(ctx.admin, ctx.restaurantId, String(body.order_id || "")).catch((e) => console.error("bill print queue failed", e?.message));
      return ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply({ ok: false, error: "invalid_status" }, 409);
    }

    if (action === "reopen") {
      const ok = await reopenBill(ctx, String(body.order_id || ""));
      return ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply({ ok: false, error: "invalid_status" }, 409);
    }

    if (action === "void_order") {
      const { status, body: out } = await voidTable(ctx.admin, ctx.restaurantId, ctx.userId, body, "POS");
      return out.ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "change_table") {
      const { status, body: out } = await changeTable(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "set_guests") {
      const { status, body: out } = await setCovers(ctx.admin, ctx.restaurantId, body);
      return out.ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "cancel_items") {
      const { status, body: out } = await cancelBillItems(ctx.admin, ctx.restaurantId, ctx.userId, body);
      return out.ok ? reply({ ok: true, ...(await liveTables(ctx)) }) : reply(out, status);
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

    if (action === "waiters") {
      return reply({ ok: true, waiters: await listWaiters(ctx.admin, ctx.restaurantId) });
    }

    if (action === "seat") {
      const picked = await resolveWaiter(ctx.admin, ctx.restaurantId, { callerId: ctx.userId, callerIsWaiter: WAITER_ROLES.includes(ctx.staffRole || ""), waiterId: body?.waiter_id });
      if (picked.error) return reply({ ok: false, error: picked.error }, 400);
      const { status, body: out } = await seatTable(ctx.admin, ctx.restaurantId, ctx.userId, body, { openedBy: picked.waiter });
      return reply(out, status);
    }

    if (action === "add_items") {
      const picked = await resolveWaiter(ctx.admin, ctx.restaurantId, { callerId: ctx.userId, callerIsWaiter: WAITER_ROLES.includes(ctx.staffRole || ""), waiterId: body?.waiter_id });
      if (picked.error) return reply({ ok: false, error: picked.error }, 400);
      const { status, body: out } = await addBillItems(ctx.admin, ctx.restaurantId, ctx.userId, body, "POS", { orderedBy: picked.waiter });
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

    if (action === "close_offered") {
      const { status, body: out } = await closeOnDeposit(ctx.admin, ctx.restaurantId, ctx.userId, body);
      if (out.ok) await queueFinalPrint(ctx.admin, ctx.restaurantId, String(body.order_id || "")).catch((e) => console.error("final bill print queue failed", e?.message));
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "fail_print") {
      await failPrintJob(ctx.admin, ctx.restaurantId, ctx.terminalId, String(body.job_id || ""), body.reason);
      return reply({ ok: true });
    }

    if (action === "print_history") {
      const orderId = String(body.order_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ ok: false, error: "invalid_order" }, 400);
      return reply({ ok: true, jobs: await printHistory(ctx.admin, ctx.restaurantId, orderId) });
    }

    if (action === "reprint") {
      const jobId = String(body.job_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) return reply({ ok: false, error: "invalid_job" }, 400);
      const out = await reprintJob(ctx.admin, ctx.restaurantId, jobId, ctx.terminalId);
      return reply(out, out.ok ? 200 : 409);
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

    if (action === "add_guest" || action === "set_item_guest") {
      const { status, body: out } = action === "add_guest"
        ? await addGuest(ctx.admin, ctx.restaurantId, ctx.userId, body)
        : await setItemGuest(ctx.admin, ctx.restaurantId, body);
      return out.ok ? reply({ ...out, ...(await liveTables(ctx)) }) : reply(out, status);
    }

    if (action === "pay_part") {
      if (!body.gateway && !body.request_id && !(await isReadyToPay(ctx, String(body.order_id || "")))) {
        return reply({ ok: false, error: "Mark this table completed first." }, 409);
      }
      const { status, body: out } = await payBillPart(ctx.admin, ctx.restaurantId, ctx.userId, body, ctx.terminalId);
      if (out.ok) {
        const invoice = await queuePartPrint(ctx.admin, ctx.restaurantId, String(body.order_id || ""), out).catch((e) => console.error("part print queue failed", e?.message));
        if (invoice) out.invoice = invoice;
      }
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
      if (out.ok) {
        const invoice = await queueFinalPrint(ctx.admin, ctx.restaurantId, String(body.order_id || "")).catch((e) => console.error("final bill print queue failed", e?.message));
        if (invoice) out.invoice = invoice;
      }
      return reply(out, status);
    }

    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    return serverError(error);
  }
}
