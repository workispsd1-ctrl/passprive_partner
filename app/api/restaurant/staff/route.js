import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STAFF_ROLE_OPTIONS = new Set(["restaurant_cashier", "restaurant_kitchen", "restaurant_bearer"]);

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

function normalizeStaffRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (STAFF_ROLE_OPTIONS.has(role)) return role;
  return "restaurant_cashier";
}

function roleDisplay(role) {
  if (role === "restaurant_kitchen") return "Restaurant_Kitchen";
  if (role === "restaurant_bearer") return "Restaurant_Bearer";
  return "Restaurant_Cashier";
}

async function getOwnerRestaurant(token) {
  const supabase = serverClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", userRes.user.id)
    .single();

  if (restErr || !restaurant?.id) return { error: "No owned restaurant found.", status: 403 };
  return { restaurantId: restaurant.id, ownerUserId: userRes.user.id };
}

function validatePin(pin) {
  const value = String(pin || "").trim();
  if (!/^\d{4,6}$/.test(value)) return null;
  return value;
}

function createSyntheticEmail(restaurantId, role) {
  const slug = String(restaurantId || "").replace(/-/g, "").slice(0, 12);
  const tag = role.replace("restaurant_", "");
  const unique = Math.random().toString(36).slice(2, 8);
  return `staff-${slug}-${tag}-${unique}@staff.passprive.local`;
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRows, error: staffErr } = await admin
      .from("restaurant_staff")
      .select("id, role, created_at, user_id")
      .eq("restaurant_id", owner.restaurantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (staffErr) return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });

    const userIds = (staffRows || []).map((x) => x.user_id).filter(Boolean);
    let userMap = {};

    if (userIds.length) {
      const { data: usersRows } = await admin.from("users").select("id, full_name, email, phone").in("id", userIds);
      userMap = Object.fromEntries((usersRows || []).map((u) => [u.id, u]));
    }

    const members = (staffRows || []).map((m) => ({
      ...m,
      full_name: userMap[m.user_id]?.full_name || "-",
      email: userMap[m.user_id]?.email || "-",
      phone: userMap[m.user_id]?.phone || "-",
    }));

    const setupUrl = `${new URL(request.url).origin}/staff-pin?restaurant_id=${owner.restaurantId}`;
    return NextResponse.json({ ok: true, members, setup_url: setupUrl, restaurant_id: owner.restaurantId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const action = String(body?.action || "create").toLowerCase();

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    if (action === "reset_pin") {
      const userId = String(body?.user_id || "").trim();
      const pin = validatePin(body?.pin);
      if (!userId || !pin) {
        return NextResponse.json({ ok: false, error: "Valid user_id and 4-6 digit pin are required." }, { status: 400 });
      }

      const { data: staffRow } = await admin
        .from("restaurant_staff")
        .select("id")
        .eq("restaurant_id", owner.restaurantId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!staffRow) return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });

      const { error: pinErr } = await admin.auth.admin.updateUserById(userId, { password: pin });
      if (pinErr) return NextResponse.json({ ok: false, error: pinErr.message }, { status: 400 });

      return NextResponse.json({ ok: true });
    }

    const full_name = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim() || null;
    const role = normalizeStaffRole(body?.role);
    const pin = validatePin(body?.pin);

    if (!full_name) {
      return NextResponse.json({ ok: false, error: "Full name is required." }, { status: 400 });
    }

    if (!pin) {
      return NextResponse.json({ ok: false, error: "PIN must be 4-6 digits." }, { status: 400 });
    }

    const email = createSyntheticEmail(owner.restaurantId, role);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { full_name: full_name || null, phone, role: roleDisplay(role) },
    });

    if (createErr || !created?.user?.id) {
      return NextResponse.json({ ok: false, error: createErr?.message || "Failed to create auth user." }, { status: 400 });
    }

    const newUserId = created.user.id;

    const { error: userInsertErr } = await admin.from("users").upsert({
      id: newUserId,
      email,
      full_name: full_name || null,
      phone,
      role,
      notifications_enabled: true,
      veg_mode: false,
      membership_tier: "none",
    });

    if (userInsertErr) return NextResponse.json({ ok: false, error: userInsertErr.message }, { status: 400 });

    const { error: staffInsertErr } = await admin.from("restaurant_staff").insert({
      restaurant_id: owner.restaurantId,
      user_id: newUserId,
      role,
      created_by: owner.ownerUserId,
    });

    if (staffInsertErr) return NextResponse.json({ ok: false, error: staffInsertErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, user_id: newUserId, role });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRow } = await admin
      .from("restaurant_staff")
      .select("id")
      .eq("restaurant_id", owner.restaurantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!staffRow) return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });

    const updates = {};
    if (body.full_name !== undefined) updates.full_name = String(body.full_name || "").trim() || null;
    if (body.phone !== undefined) updates.phone = String(body.phone || "").trim() || null;

    if (Object.keys(updates).length) {
      const { error: updErr } = await admin.from("users").update(updates).eq("id", userId);
      if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnerRestaurant(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRow } = await admin
      .from("restaurant_staff")
      .select("id")
      .eq("restaurant_id", owner.restaurantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!staffRow) return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
