import { NextResponse } from "next/server";
import { requireTerminal, serverError } from "../_terminal";

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
    const { admin, restaurantId } = ctx;

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
        .select("id, table_no, label, capacity")
        .eq("restaurant_id", restaurantId)
        .order("table_no", { ascending: true }),
      admin
        .from("restaurant_table_bookings")
        .select("id, table_no, guest_count, booking_status, payment_status, total_amount, order_items, notes, updated_at, source, order_details")
        .eq("restaurant_id", restaurantId)
        .not("booking_status", "in", "(CANCELLED,COMPLETED,PAID)")
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

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: restaurantRow.id,
        name: restaurantRow.name || "Restaurant",
        cover_image: restaurantRow.cover_image || "",
      },
      menu: parseMenu(restaurantRow.menu_json),
      tables: tableRows || [],
      open_orders: orderRows || [],
    });
  } catch (error) {
    return serverError(error);
  }
}
