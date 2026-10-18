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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireMaster(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return { error: "Missing auth token", status: 401 };

  const admin = adminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is missing.", status: 500 };

  const { data: userRes, error: userErr } = await serverClient().auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };
  const userId = userRes.user.id;

  const { data: userRow } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
  if (String(userRow?.role || "").toLowerCase() !== "restaurantpartner") {
    return { error: "Only the master account can manage branches.", status: 403 };
  }

  const { data: owned, error: ownedErr } = await admin
    .from("restaurants")
    .select("id, name, area, city, is_active, cover_image, brn, registered_name, cost_for_two, created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true });
  if (ownedErr) return { error: ownedErr.message, status: 400 };
  if (!owned?.length) return { error: "No restaurant is linked to this master account.", status: 403 };

  return { admin, userId, owned };
}

export async function GET(request) {
  try {
    const ctx = await requireMaster(request);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

    const ids = ctx.owned.map((r) => r.id);
    const { data: staff, error } = await ctx.admin
      .from("restaurant_staff")
      .select("restaurant_id, user_id, users:user_id(full_name, email)")
      .in("restaurant_id", ids)
      .eq("role", "restaurant_admin");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    const adminsByRestaurant = new Map();
    (staff || []).forEach((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const list = adminsByRestaurant.get(row.restaurant_id) || [];
      list.push({ user_id: row.user_id, full_name: user?.full_name || null, email: user?.email || null });
      adminsByRestaurant.set(row.restaurant_id, list);
    });

    const branches = ctx.owned.map((r) => ({ ...r, branch_admins: adminsByRestaurant.get(r.id) || [] }));
    return NextResponse.json({ ok: true, branches });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  let createdRestaurantId = null;
  let createdUserId = null;
  let admin = null;

  try {
    const ctx = await requireMaster(request);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    admin = ctx.admin;

    const body = await request.json();
    const name = String(body?.name || "").trim();
    const area = String(body?.area || "").trim() || null;
    const city = String(body?.city || "").trim() || null;
    const fullAddress = String(body?.full_address || "").trim() || null;
    const phone = String(body?.phone || "").trim() || null;
    const adminName = String(body?.admin_full_name || "").trim();
    const adminEmail = String(body?.admin_email || "").trim().toLowerCase();
    const adminPassword = String(body?.admin_password || "");

    if (!name) return NextResponse.json({ ok: false, error: "Branch name is required." }, { status: 400 });
    if (!area && !city) return NextResponse.json({ ok: false, error: "Area or city is required." }, { status: 400 });
    if (!adminName) return NextResponse.json({ ok: false, error: "Branch partner name is required." }, { status: 400 });
    if (!EMAIL_RE.test(adminEmail)) return NextResponse.json({ ok: false, error: "A valid branch partner email is required." }, { status: 400 });
    if (adminPassword.length < 8) {
      return NextResponse.json({ ok: false, error: "Branch partner password must be at least 8 characters." }, { status: 400 });
    }

    const brand = ctx.owned[0];
    const { data: restaurant, error: restaurantErr } = await admin
      .from("restaurants")
      .insert({
        name,
        area,
        city,
        full_address: fullAddress,
        phone,
        owner_user_id: ctx.userId,
        is_active: true,
        brn: brand.brn || null,
        registered_name: brand.registered_name || null,
        cost_for_two: brand.cost_for_two || null,
        merchant_plan: "free",
        service_level: "discoverable",
      })
      .select("id, name, area, city, is_active")
      .single();
    if (restaurantErr) return NextResponse.json({ ok: false, error: restaurantErr.message }, { status: 400 });
    createdRestaurantId = restaurant.id;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName, role: "Restaurant_Admin" },
    });
    if (createErr || !created?.user?.id) throw new Error(createErr?.message || "Failed to create the branch partner login.");
    createdUserId = created.user.id;

    const { error: userErr } = await admin.from("users").upsert({
      id: createdUserId,
      email: adminEmail,
      full_name: adminName,
      role: "restaurant_admin",
      notifications_enabled: true,
      veg_mode: false,
      membership_tier: "none",
    });
    if (userErr) throw new Error(userErr.message);

    const { error: staffErr } = await admin.from("restaurant_staff").insert({
      restaurant_id: createdRestaurantId,
      user_id: createdUserId,
      role: "restaurant_admin",
      created_by: ctx.userId,
    });
    if (staffErr) throw new Error(staffErr.message);

    return NextResponse.json({ ok: true, branch: restaurant, branch_admin_user_id: createdUserId });
  } catch (error) {
    if (admin && createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    if (admin && createdRestaurantId) await admin.from("restaurants").delete().eq("id", createdRestaurantId);
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
