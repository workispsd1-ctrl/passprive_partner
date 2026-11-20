import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lanDeviceOnline, queueTestPrint } from "@/lib/server/printJobs";

const UUID = /^[0-9a-f-]{36}$/i;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function asUser(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!token) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const printerId = String(body?.printer_id || "");
    if (body?.action !== "test" || !UUID.test(printerId)) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const db = admin();
    const { data: printer, error } = await db
      .from("restaurant_printers")
      .select("id, restaurant_id, name, ip, port, paper_mm, prints, is_active")
      .eq("id", printerId)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!printer) return NextResponse.json({ ok: false, error: "Printer not found." }, { status: 404 });

    const { data: allowed, error: authErr } = await asUser(token).rpc("can_manage_restaurant", {
      in_restaurant_id: printer.restaurant_id,
    });
    if (authErr || !allowed) return NextResponse.json({ ok: false, error: "You can't manage this restaurant." }, { status: 403 });

    if (!(await lanDeviceOnline(db, printer.restaurant_id))) {
      return NextResponse.json(
        {
          ok: false,
          error: "No PassPrive POS with network printing is online at the restaurant. Open the updated POS app on the restaurant Wi-Fi, then try again.",
        },
        { status: 409 }
      );
    }
    await queueTestPrint(db, printer.restaurant_id, printer, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Unknown error" }, { status: 500 });
  }
}
