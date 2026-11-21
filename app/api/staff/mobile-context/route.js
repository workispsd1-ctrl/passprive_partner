import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { movesFor } from "@/lib/server/guestMoves";
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
    const { admin, restaurantId, terminalId, userId } = ctx;
    const body = await request.json().catch(() => ({}));
    const knownMenu = String(body?.menu_v || "");

    const [
      { data: restaurantRow, error: restaurantErr },
      { data: tableRows, error: tableErr },
      { data: orderRows, error: orderErr },
    ] = await Promise.all([
      admin
        .from("restaurants")
        .select("id, name, cover_image, is_active, menu_json")
        .eq("id", restaurantId)
        .eq("is_active", true)
        .maybeSingle(),
      admin
        .from("restaurant_table_layouts")
        .select("id, table_no, label, capacity, attached_to, area_id, restaurant_table_areas:area_id(name)")
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
    ]);

    if (restaurantErr) return serverError(restaurantErr);
    if (tableErr) return serverError(tableErr);
    if (orderErr) return serverError(orderErr);
    if (!restaurantRow?.id) {
      return NextResponse.json({ ok: false, error: "Restaurant not found." }, { status: 404 });
    }

    const [{ data: terminalRow }, { data: staffRow }] = await Promise.all([
      admin.from("pos_terminals").select("area_id, restaurant_table_areas:area_id(id, name)").eq("id", terminalId).maybeSingle(),
      admin
        .from("restaurant_staff")
        .select("area_id, restaurant_table_areas:area_id(id, name)")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);
    const areaOf = (row) => {
      const a = Array.isArray(row?.restaurant_table_areas) ? row.restaurant_table_areas[0] : row?.restaurant_table_areas;
      return row?.area_id && a?.id ? { id: a.id, name: a.name || "" } : null;
    };
    const area = areaOf(staffRow) || areaOf(terminalRow);
    const allTables = (tableRows || []).map(({ restaurant_table_areas: a, ...t }) => ({
      ...t,
      area_name: (Array.isArray(a) ? a[0]?.name : a?.name) || null,
    }));
    const inArea = (t) => {
      if (!area) return true;
      const host = t.attached_to ? allTables.find((x) => x.id === t.attached_to) : null;
      return (host || t).area_id === area.id;
    };
    const areaTables = allTables.filter(inArea);
    const areaNos = new Set(areaTables.map((t) => Number(t.table_no)));
    const openOrders = (orderRows || []).filter((o) => !isQrPending(o) && (!area || areaNos.has(Number(o.table_no))));

    const menu = parseMenu(restaurantRow.menu_json);
    const menuV = createHash("sha1").update(JSON.stringify(menu)).digest("hex").slice(0, 16);

    return NextResponse.json({
      ok: true,
      menu_v: menuV,
      restaurant: {
        id: restaurantRow.id,
        name: restaurantRow.name || "Restaurant",
        cover_image: restaurantRow.cover_image || "",
      },
      ...(knownMenu === menuV ? {} : { menu }),
      area,
      guest_moves: await movesFor(admin, restaurantId, area?.id || null, userId).catch(() => ({ to_seat: [], notices: [] })),
      tables: areaTables,
      open_orders: openOrders,
    });
  } catch (error) {
    return serverError(error);
  }
}
