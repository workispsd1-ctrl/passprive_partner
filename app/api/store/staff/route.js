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

async function getOwnedStoreIds(token) {
  const supabase = serverClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };

  const { data: stores, error: storesErr } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", userRes.user.id)
    .limit(100);

  if (storesErr) return { error: storesErr.message, status: 400 };
  const storeIds = (stores || []).map((s) => s.id).filter(Boolean);
  if (!storeIds.length) return { error: "No owned store found.", status: 403 };
  return { storeIds, ownerUserId: userRes.user.id };
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnedStoreIds(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRows, error: staffErr } = await admin
      .from("store_staff")
      .select("store_id, user_id, role, created_at")
      .in("store_id", owner.storeIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (staffErr) return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });

    const userIds = (staffRows || []).map((x) => x.user_id).filter(Boolean);
    let userMap = {};

    if (userIds.length) {
      const { data: usersRows } = await admin.from("users").select("id, full_name, email, phone").in("id", userIds);
      userMap = Object.fromEntries((usersRows || []).map((u) => [u.id, u]));
    }

    const members = (staffRows || []).map((m, idx) => ({
      id: `${m.store_id}-${m.user_id}-${idx}`,
      ...m,
      full_name: userMap[m.user_id]?.full_name || "-",
      email: userMap[m.user_id]?.email || "-",
      phone: userMap[m.user_id]?.phone || "-",
    }));

    return NextResponse.json({ ok: true, members });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnedStoreIds(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const full_name = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim() || null;
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Email and password (min 6 chars) are required." }, { status: 400 });
    }

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || null, phone, role: "Cashier" },
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
      role: "Cashier",
      notifications_enabled: true,
      veg_mode: false,
      membership_tier: "none",
    });

    if (userInsertErr) return NextResponse.json({ ok: false, error: userInsertErr.message }, { status: 400 });

    const { error: staffErr } = await admin.from("store_staff").insert({
      store_id: owner.storeIds[0],
      user_id: newUserId,
      role: "cashier",
      created_by: owner.ownerUserId,
    });

    if (staffErr) return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, user_id: newUserId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const owner = await getOwnedStoreIds(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRow } = await admin
      .from("store_staff")
      .select("user_id")
      .in("store_id", owner.storeIds)
      .eq("user_id", userId)
      .limit(1)
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

    const owner = await getOwnedStoreIds(token);
    if (owner.error) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });

    const body = await request.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });

    const admin = adminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });

    const { data: staffRow } = await admin
      .from("store_staff")
      .select("user_id")
      .in("store_id", owner.storeIds)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!staffRow) return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
