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

async function resolveKitchenRestaurant(token) {
  const supabase = serverClient();
  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const userId = userRes.user.id;

  const { data: userRow, error: userRowErr } = await admin
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (userRowErr) return { error: userRowErr.message, status: 400 };

  const role = String(userRow?.role || "").toLowerCase();
  if (![
    "restaurant_kitchen",
    "restaurant_cashier",
    "restaurantpartner",
    "restaurant_partner",
    "admin",
    "superadmin",
  ].includes(role)) {
    return { error: "Access denied", status: 403 };
  }

  const { data: staffRow, error: staffErr } = await admin
    .from("restaurant_staff")
    .select("restaurant_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (staffErr) return { error: staffErr.message, status: 400 };

  if (!staffRow?.restaurant_id) {
    return { error: "No restaurant assigned for this account.", status: 403 };
  }

  const { data: restaurant, error: restaurantErr } = await admin
    .from("restaurants")
    .select("id, name, cover_image")
    .eq("id", staffRow.restaurant_id)
    .maybeSingle();

  if (restaurantErr) return { error: restaurantErr.message, status: 400 };
  if (!restaurant?.id) return { error: "Restaurant not found", status: 404 };

  return {
    userId,
    role,
    userName: userRow?.full_name || "Operator",
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || "Restaurant",
    restaurantLogo: restaurant.cover_image || "",
    admin,
  };
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const ctx = await resolveKitchenRestaurant(token);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const { data, error } = await ctx.admin
      .from("restaurant_orders")
      .select(
        "id,order_number,customer_name,customer_phone,items,subtotal,tax_amount,discount_amount,total_amount,payment_method,payment_status,order_status,pickup_eta,pickup_code,notes,metadata,accepted_at,ready_at,picked_up_at,cancelled_at,created_at,updated_at"
      )
      .eq("restaurant_id", ctx.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: ctx.restaurantId,
        name: ctx.restaurantName,
        logo: ctx.restaurantLogo,
      },
      operator_name: ctx.userName,
      orders: data || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
