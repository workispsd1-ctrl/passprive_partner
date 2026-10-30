import { NextResponse } from "next/server";
import { bookingBill, payBillBill, pickupBill, tableBill } from "@/lib/server/billHistory";
import { requireTerminal, serverError } from "../_terminal";

const LIMIT = 5;
const NO_ACCESS = /waiter|bearer|kitchen/;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const { admin, restaurantId } = ctx;

    const [tableRes, pickupRes, bookingRes, billRes, merchantRes] = await Promise.all([
      admin
        .from("restaurant_table_bookings")
        .select("id,table_no,customer_name,customer_phone,order_items,order_details,subtotal_amount,tax_amount,total_amount,payment_method,payment_reference,booking_status,guest_count,notes,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),booking_status.eq.PAID")
        .neq("booking_status", "CANCELLED")
        .order("updated_at", { ascending: false })
        .limit(LIMIT + 4),
      admin
        .from("restaurant_orders")
        .select("id,order_number,pickup_code,customer_name,customer_phone,items,subtotal,tax_amount,discount_amount,total_amount,payment_method,order_status,notes,picked_up_at,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),order_status.in.(PICKED_UP,COMPLETED)")
        .neq("order_status", "CANCELLED")
        .order("updated_at", { ascending: false })
        .limit(LIMIT + 4),
      admin
        .from("restaurant_bookings")
        .select("id,booking_code,customer_name,customer_phone,party_size,booking_date,booking_time,payment_amount,payment_reference,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_status", "paid")
        .gt("payment_amount", 0)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      admin
        .from("payment_sessions")
        .select("id,tracking_id,amount_major,original_amount,discount_amount,discount_name,cashback_amount,bank_reference,authorization_code,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_context", "BILL_PAYMENT")
        .in("status", ["VERIFIED_SUCCESS", "FINALIZED"])
        .order("updated_at", { ascending: false })
        .limit(LIMIT),
      admin
        .from("restaurants")
        .select("name,registered_name,brn,full_address,phone")
        .eq("id", restaurantId)
        .maybeSingle(),
    ]);
    for (const res of [tableRes, pickupRes, bookingRes, billRes, merchantRes]) {
      if (res.error) return serverError(res.error);
    }

    const payments = [
      ...(tableRes.data || []).map(tableBill),
      ...(pickupRes.data || []).map(pickupBill),
      ...(bookingRes.data || []).map(bookingBill),
      ...(billRes.data || []).map(payBillBill),
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, LIMIT);
    for (const bill of payments) delete bill.staff_id;

    return NextResponse.json({ ok: true, payments, merchant: merchantRes.data || null });
  } catch (error) {
    return serverError(error);
  }
}
