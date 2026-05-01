import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  if (value === "cashier") return "restaurant_cashier";
  return value;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const restaurantId = String(body?.restaurant_id || "").trim();
    const pin = String(body?.pin || "").trim();
    const deviceId = String(body?.device_id || "").trim();

    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurant_id is required" }, { status: 400 });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "PIN must be 4-6 digits." }, { status: 400 });
    }

    const supabase = serverClient();

    if (deviceId) {
      const { data: paired, error: pairErr } = await supabase
        .from("restaurant_staff_devices")
        .select("device_id")
        .eq("device_id", deviceId)
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .maybeSingle();

      if (pairErr) return NextResponse.json({ ok: false, error: pairErr.message }, { status: 400 });
      if (!paired?.device_id) {
        return NextResponse.json({ ok: false, error: "This device is not paired for this restaurant." }, { status: 403 });
      }
    }

    const { data: members, error: staffErr } = await supabase
      .from("restaurant_staff")
      .select("user_id, role")
      .eq("restaurant_id", restaurantId);

    if (staffErr) return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });

    const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
    if (!userIds.length) {
      return NextResponse.json({ ok: false, error: "No staff users found for this restaurant." }, { status: 404 });
    }

    const { data: usersRows, error: usersErr } = await supabase
      .from("users")
      .select("id, email, role")
      .in("id", userIds);

    if (usersErr) return NextResponse.json({ ok: false, error: usersErr.message }, { status: 400 });

    const roleByUser = new Map((members || []).map((m) => [m.user_id, normalizeRole(m.role)]));

    for (const row of usersRows || []) {
      const email = String(row?.email || "").trim().toLowerCase();
      if (!email) continue;

      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: pin,
      });

      if (!signInErr && signInData?.session && signInData?.user) {
        await supabase.auth.signOut();
        return NextResponse.json({
          ok: true,
          email,
          role: roleByUser.get(row.id) || normalizeRole(row?.role),
        });
      }
    }

    return NextResponse.json({ ok: false, error: "Invalid PIN for this restaurant." }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
