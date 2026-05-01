import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serverClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const supabase = serverClient();
    const admin = adminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing." }, { status: 500 });
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = userRes.user.id;

    const [{ data: staffRow, error: staffErr }, { data: userRow, error: profileErr }] = await Promise.all([
      admin
        .from("restaurant_staff")
        .select("restaurant_id, role")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (staffErr) {
      return NextResponse.json({ ok: false, error: staffErr.message }, { status: 400 });
    }

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 400 });
    }

    let restaurantId = staffRow?.restaurant_id || null;

    if (!restaurantId) {
      const { data: ownerRow, error: ownerErr } = await admin
        .from("restaurants")
        .select("id")
        .eq("owner_user_id", userId)
        .maybeSingle();

      if (ownerErr) {
        return NextResponse.json({ ok: false, error: ownerErr.message }, { status: 400 });
      }

      restaurantId = ownerRow?.id || null;
    }

    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "No restaurant mapped to this user." }, { status: 404 });
    }

    const { data: restaurantRow, error: restaurantErr } = await admin
      .from("restaurants")
      .select("id, name, cover_image")
      .eq("id", restaurantId)
      .maybeSingle();

    if (restaurantErr) {
      return NextResponse.json({ ok: false, error: restaurantErr.message }, { status: 400 });
    }

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
      operator_name: userRow?.full_name || "Operator",
      staff_role: staffRow?.role || null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}