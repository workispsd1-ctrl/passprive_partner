import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

// Resolve the authenticated staff user + their restaurant. No strict role gate
// (waiter/bearer/admin/cashier all manage the floor); returns userId + name.
async function resolveStaff(token) {
  const supabase = serverClient();
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };
  const userId = userRes.user.id;

  const { data: userRow } = await admin
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: staffRow } = await admin
    .from("restaurant_staff")
    .select("restaurant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  let restaurantId = staffRow?.restaurant_id || null;
  if (!restaurantId) {
    const { data: ownerRow } = await admin
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle();
    restaurantId = ownerRow?.id || null;
  }
  if (!restaurantId) return { error: "No restaurant found for this account.", status: 403 };

  return {
    userId,
    userName: userRow?.full_name || userRes.user?.user_metadata?.full_name || "Waiter",
    role: String(userRow?.role || "").toLowerCase(),
    restaurantId,
    admin,
  };
}

// A table still "belongs" to its waiter while it has any open (unpaid) order.
function isOpenOrder(row) {
  const booking = String(row?.booking_status || "").toUpperCase();
  const payment = String(row?.payment_status || "").toUpperCase();
  if (booking === "CANCELLED" || booking === "PAID") return false;
  if (payment === "PAID") return false;
  return true;
}

// Release any active assignment whose table no longer has an open order
// (bill paid / all cancelled) — keeps ownership self-healing without coupling
// to the payment action. Returns the still-active assignments.
async function releaseStaleAndList(ctx) {
  const [{ data: assignments, error: aErr }, { data: orders, error: oErr }] = await Promise.all([
    ctx.admin
      .from("restaurant_table_assignments")
      .select("id, table_no, waiter_user_id, waiter_name, claimed_at")
      .eq("restaurant_id", ctx.restaurantId)
      .is("released_at", null),
    ctx.admin
      .from("restaurant_table_bookings")
      .select("table_no, booking_status, payment_status")
      .eq("restaurant_id", ctx.restaurantId),
  ]);
  if (aErr) throw new Error(aErr.message);
  if (oErr) throw new Error(oErr.message);

  const openTableNos = new Set(
    (orders || [])
      .filter(isOpenOrder)
      .map((o) => Number(o.table_no || 0))
      .filter((n) => Number.isInteger(n) && n > 0)
  );

  const active = Array.isArray(assignments) ? assignments : [];
  const staleIds = active
    .filter((a) => !openTableNos.has(Number(a.table_no)))
    .map((a) => a.id);

  if (staleIds.length > 0) {
    await ctx.admin
      .from("restaurant_table_assignments")
      .update({ released_at: new Date().toISOString() })
      .in("id", staleIds);
  }

  return active.filter((a) => openTableNos.has(Number(a.table_no)));
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveStaff(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const active = await releaseStaleAndList(ctx);
    return NextResponse.json({
      ok: true,
      me: ctx.userId,
      assignments: active.map((a) => ({
        table_no: Number(a.table_no),
        waiter_user_id: a.waiter_user_id,
        waiter_name: a.waiter_name || "Waiter",
        claimed_at: a.claimed_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const ctx = await resolveStaff(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const tableNo = Number(body?.table_no || 0);
    if (!Number.isInteger(tableNo) || tableNo <= 0) {
      return NextResponse.json({ ok: false, error: "Valid table_no is required" }, { status: 400 });
    }

    if (action === "claim") {
      // Insert a new active assignment. The partial unique index guarantees only
      // one active owner per table — a concurrent claim hits the conflict below.
      const { data, error } = await ctx.admin
        .from("restaurant_table_assignments")
        .insert({
          restaurant_id: ctx.restaurantId,
          table_no: tableNo,
          waiter_user_id: ctx.userId,
          waiter_name: ctx.userName,
        })
        .select("id, table_no, waiter_user_id, waiter_name")
        .maybeSingle();

      if (error) {
        // Unique violation → already claimed. Return the current owner.
        const { data: existing } = await ctx.admin
          .from("restaurant_table_assignments")
          .select("waiter_user_id, waiter_name")
          .eq("restaurant_id", ctx.restaurantId)
          .eq("table_no", tableNo)
          .is("released_at", null)
          .maybeSingle();
        if (existing?.waiter_user_id) {
          const mine = existing.waiter_user_id === ctx.userId;
          return NextResponse.json(
            {
              ok: mine, // claiming a table you already own is a no-op success
              error: mine ? undefined : `Table ${tableNo} is already taken by ${existing.waiter_name || "another waiter"}.`,
              owner_user_id: existing.waiter_user_id,
              owner_name: existing.waiter_name || "Waiter",
            },
            { status: mine ? 200 : 409 }
          );
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, assignment: data });
    }

    if (action === "release") {
      // Only the current owner (or an admin) may release.
      const { data: existing } = await ctx.admin
        .from("restaurant_table_assignments")
        .select("id, waiter_user_id")
        .eq("restaurant_id", ctx.restaurantId)
        .eq("table_no", tableNo)
        .is("released_at", null)
        .maybeSingle();

      if (!existing?.id) return NextResponse.json({ ok: true, released: false }); // already free
      const isAdmin = ["restaurant_admin", "admin", "superadmin"].includes(ctx.role);
      if (existing.waiter_user_id !== ctx.userId && !isAdmin) {
        return NextResponse.json({ ok: false, error: "Only the owner can release this table." }, { status: 403 });
      }
      const { error } = await ctx.admin
        .from("restaurant_table_assignments")
        .update({ released_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, released: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
