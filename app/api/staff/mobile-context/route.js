import { venueOf } from "@/lib/server/tillArea";
import { menuForArea } from "@/lib/menuAreas";
import { onlinePosTerminals } from "@/lib/server/payRequests";
import { listWaiters, WAITER_ROLES } from "@/lib/server/waiters";
import { NextResponse } from "next/server";
import { movesFor } from "@/lib/server/guestMoves";
import { markDiscoveryCapable, pendingDiscovery } from "@/lib/server/printerDiscovery";
import { activePrinters, pendingPrintJobs, RECEIPT_KINDS, stuckPrintJobs, TICKET_KINDS } from "@/lib/server/printJobs";
import { requireTerminal, serverError } from "../_terminal";
import { isQrPending } from "@/lib/server/printJobs";

function parseMenu(menu) {
  if (!menu) return {};
  if (typeof menu === "string") {
    try {
      return JSON.parse(menu);
    } catch {
      return {};
    }
  }
  return menu;
}

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request, ["payments"]);
    if (ctx.error) return ctx.error;
    const { admin, restaurantId, terminalId, userId, staffRole } = ctx;
    const body = await request.json().catch(() => ({}));
    const knownMenu = String(body?.menu_v || "");
    const printerHelper = body?.discovery === true && (!staffRole || ["cashier", "restaurant_cashier", "restaurant_admin", "admin"].includes(staffRole));
    const kinds = [...TICKET_KINDS, ...RECEIPT_KINDS.filter((k) => Array.isArray(body?.print_kinds) && body.print_kinds.includes(k)), "test"];
    const none = Promise.resolve(null);

    const [
      ,
      { data: restaurantRow, error: restaurantErr },
      { data: tableRows, error: tableErr },
      { data: orderRows, error: orderErr },
      { data: terminalRow },
      { data: staffRow },
      { data: areaRows },
      discovery,
      printJobs,
      printers,
      waiters,
      posTerminals,
      stuckPrints,
    ] = await Promise.all([
      printerHelper ? markDiscoveryCapable(admin, terminalId).catch(() => null) : none,
      admin.from("restaurants").select("id, name, cover_image, is_active, menu_hash").eq("id", restaurantId).eq("is_active", true).maybeSingle(),
      admin
        .from("restaurant_table_layouts")
        .select("id, table_no, label, capacity, attached_to, area_id, restaurant_table_areas!restaurant_table_layouts_area_fk(name)")
        .eq("restaurant_id", restaurantId)
        .order("table_no", { ascending: true }),
      admin
        .from("restaurant_table_bookings")
        .select("id, table_no, guest_count, customer_name, customer_phone, booking_status, payment_status, subtotal_amount, tax_amount, total_amount, order_items, notes, created_at, updated_at, source, order_details")
        .eq("restaurant_id", restaurantId)
        .not("booking_status", "in", "(CANCELLED,PAID)")
        .not("payment_status", "in", "(PAID,COMPLETED)")
        .order("updated_at", { ascending: false })
        .limit(100),
      admin.from("pos_terminals").select("area_id, restaurant_table_areas:area_id(id, name)").eq("id", terminalId).maybeSingle(),
      admin
        .from("restaurant_staff")
        .select("area_id, restaurant_table_areas:area_id(id, name)")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      admin.from("restaurant_table_areas").select("id, menu_area_id").eq("restaurant_id", restaurantId),
      printerHelper ? pendingDiscovery(admin, restaurantId).catch(() => []) : none,
      printerHelper ? pendingPrintJobs(admin, restaurantId, kinds, true).catch(() => []) : none,
      printerHelper ? activePrinters(admin, restaurantId).catch(() => []) : none,
      listWaiters(admin, restaurantId).catch(() => []),
      onlinePosTerminals(admin, restaurantId).catch(() => []),
      stuckPrintJobs(admin, restaurantId).catch(() => []),
    ]);

    if (restaurantErr) return serverError(restaurantErr);
    if (tableErr) return serverError(tableErr);
    if (orderErr) return serverError(orderErr);
    if (!restaurantRow?.id) {
      return NextResponse.json({ ok: false, error: "Restaurant not found." }, { status: 404 });
    }

    const areaOf = (row) => {
      const a = Array.isArray(row?.restaurant_table_areas) ? row.restaurant_table_areas[0] : row?.restaurant_table_areas;
      return row?.area_id && a?.id ? { id: a.id, name: a.name || "" } : null;
    };
    const area = areaOf(staffRow) || areaOf(terminalRow);
    const venue = area ? venueOf(areaRows, area.id) : null;
    const allTables = (tableRows || []).map(({ restaurant_table_areas: a, ...t }) => ({
      ...t,
      area_name: (Array.isArray(a) ? a[0]?.name : a?.name) || null,
    }));
    const inArea = (t) => {
      if (!area) return true;
      const host = t.attached_to ? allTables.find((x) => x.id === t.attached_to) : null;
      return venue.ids.has((host || t).area_id);
    };
    const areaTables = allTables.filter(inArea);
    const areaNos = new Set(areaTables.map((t) => Number(t.table_no)));
    const planNos = new Set(allTables.map((t) => Number(t.table_no)));
    const openOrders = (orderRows || []).filter((o) => !isQrPending(o) && (!area || areaNos.has(Number(o.table_no)) || !planNos.has(Number(o.table_no))));

    const menuV = `${String(restaurantRow.menu_hash || "none").slice(0, 16)}${venue?.menuAreaId ? `:${String(venue.menuAreaId).slice(0, 8)}` : ""}`;
    const [menuRes, moves] = await Promise.all([
      knownMenu === menuV ? Promise.resolve(null) : admin.from("restaurants").select("menu_json").eq("id", restaurantId).maybeSingle(),
      movesFor(admin, restaurantId, area?.id || null, userId).catch(() => ({ to_seat: [], notices: [] })),
    ]);
    const menu = menuRes ? menuForArea(parseMenu(menuRes.data?.menu_json), venue?.menuAreaId) : null;

    return NextResponse.json({
      ok: true,
      menu_v: menuV,
      restaurant: {
        id: restaurantRow.id,
        name: restaurantRow.name || "Restaurant",
        cover_image: restaurantRow.cover_image || "",
      },
      ...(menu ? { menu } : {}),
      area,
      ...(printerHelper
        ? {
            printer_discovery: discovery || [],
            print_jobs: printJobs || [],
            printers: (printers || []).map((p) => ({
              id: p.id,
              name: p.name,
              ip: p.ip,
              port: p.port,
              paper_mm: p.paper_mm,
              prints: p.prints,
              backup_printer_id: p.backup_printer_id || null,
            })),
          }
        : {}),
      guest_moves: moves,
      tables: areaTables,
      open_orders: openOrders,
      waiters,
      pos_terminals: posTerminals,
      stuck_prints: stuckPrints,
      me: { id: userId, waiter: WAITER_ROLES.includes(String(staffRole || "")) },
    });
  } catch (error) {
    return serverError(error);
  }
}
