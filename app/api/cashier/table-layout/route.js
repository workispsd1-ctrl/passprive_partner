import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const [layoutRes, ordersRes] = await Promise.all([
      ctx.admin
        .from("restaurant_table_layouts")
        .select("id, table_no, label, shape, capacity, pos_x, pos_y")
        .eq("restaurant_id", ctx.restaurantId)
        .order("table_no", { ascending: true }),
      ctx.admin
        .from("restaurant_table_bookings")
        .select("id, table_no, total_amount, booking_status, payment_status")
        .eq("restaurant_id", ctx.restaurantId)
        .order("created_at", { ascending: false }),
    ]);

    if (layoutRes.error) return NextResponse.json({ ok: false, error: layoutRes.error.message }, { status: 400 });
    if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      restaurant_id: ctx.restaurantId,
      tables: layoutRes.data || [],
      orders: ordersRes.data || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const tables = Array.isArray(body?.tables) ? body.tables : [];

    const rows = tables.map((t, idx) => ({
      id: t.id,
      restaurant_id: ctx.restaurantId,
      table_no: Number(t.table_no || idx + 1),
      label: String(t.label || `T${idx + 1}`),
      shape: String(t.shape || "square"),
      capacity: Number(t.capacity || 4),
      pos_x: Number(t.pos_x || 10),
      pos_y: Number(t.pos_y || 10),
    }));

    const { error } = await ctx.admin.from("restaurant_table_layouts").upsert(rows, { onConflict: "id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveCashierRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();

    if (action !== "move_customers") {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    const fromTable = Number(body?.from_table || 0);
    const toTable = Number(body?.to_table || 0);
    if (!Number.isInteger(fromTable) || !Number.isInteger(toTable) || fromTable <= 0 || toTable <= 0 || fromTable === toTable) {
      return NextResponse.json({ ok: false, error: "Invalid table numbers" }, { status: 400 });
    }

    const { data: activeRows, error: activeErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .select("id, booking_status, payment_status")
      .eq("restaurant_id", ctx.restaurantId)
      .eq("table_no", fromTable);

    if (activeErr) return NextResponse.json({ ok: false, error: activeErr.message }, { status: 400 });

    const movableIds = (activeRows || [])
      .filter((row) => {
        const status = String(row?.booking_status || "").toUpperCase();
        const payment = String(row?.payment_status || "").toUpperCase();
        if (["CANCELLED", "PAID", "COMPLETED", "SERVED"].includes(status)) return false;
        if (["PAID", "COMPLETED"].includes(payment)) return false;
        return true;
      })
      .map((row) => row.id);

    if (!movableIds.length) {
      return NextResponse.json({ ok: false, error: `No active customers on T${fromTable}.` }, { status: 400 });
    }

    const { data: updatedRows, error: moveErr } = await ctx.admin
      .from("restaurant_table_bookings")
      .update({ table_no: toTable, updated_at: new Date().toISOString() })
      .eq("restaurant_id", ctx.restaurantId)
      .in("id", movableIds)
      .select("id");

    if (moveErr) return NextResponse.json({ ok: false, error: moveErr.message }, { status: 400 });
    const movedCount = Array.isArray(updatedRows) ? updatedRows.length : 0;
    if (movedCount === 0) {
      return NextResponse.json({ ok: false, error: "Move failed: no orders were updated." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, moved_count: movedCount, from_table: fromTable, to_table: toTable });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
