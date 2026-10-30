import {
  billsInRange,
  bookingBill,
  mauritiusDayRange,
  payBillBill,
  pickupBill,
  summarize,
  tableBill,
} from "@/lib/server/billHistory";
import { readJson, reply, requireTerminal, serverError } from "../_terminal";

const NO_ACCESS = /waiter|bearer|kitchen/;
const MAURITIUS_OFFSET_MS = 4 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const ctx = await requireTerminal(request);
    if (ctx.error) return ctx.error;
    if (NO_ACCESS.test(ctx.staffRole || "")) return reply({ ok: false, error: "forbidden" }, 403);
    const { admin, restaurantId } = ctx;

    const body = await readJson(request);
    const date = body.date || new Date(Date.now() + MAURITIUS_OFFSET_MS).toISOString().slice(0, 10);
    const range = mauritiusDayRange(date);
    if (!range) return reply({ ok: false, error: "invalid_date" }, 400);
    const { start, end } = range;

    const [tableRes, pickupRes, bookingRes, payBillRes, merchantRes] = await Promise.all([
      admin
        .from("restaurant_table_bookings")
        .select("id,table_no,customer_name,customer_phone,order_items,order_details,subtotal_amount,tax_amount,total_amount,payment_method,payment_reference,booking_status,guest_count,notes,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),booking_status.in.(PAID,CANCELLED)")
        .gte("updated_at", start)
        .lt("updated_at", end)
        .limit(2000),
      admin
        .from("restaurant_orders")
        .select("id,order_number,pickup_code,customer_name,customer_phone,items,subtotal,tax_amount,discount_amount,total_amount,payment_method,order_status,notes,picked_up_at,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .or("payment_status.in.(PAID,COMPLETED),order_status.in.(PICKED_UP,COMPLETED,CANCELLED)")
        .gte("updated_at", start)
        .lt("updated_at", end)
        .limit(2000),
      admin
        .from("restaurant_bookings")
        .select("id,booking_code,customer_name,customer_phone,party_size,booking_date,booking_time,payment_amount,payment_reference,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_status", "paid")
        .gt("payment_amount", 0)
        .neq("status", "cancelled")
        .gte("created_at", start)
        .lt("created_at", end)
        .limit(2000),
      admin
        .from("payment_sessions")
        .select("id,tracking_id,amount_major,original_amount,discount_amount,discount_name,cashback_amount,bank_reference,authorization_code,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_context", "BILL_PAYMENT")
        .in("status", ["VERIFIED_SUCCESS", "FINALIZED"])
        .gte("updated_at", start)
        .lt("updated_at", end)
        .limit(2000),
      admin
        .from("restaurants")
        .select("name,registered_name,brn,full_address,phone")
        .eq("id", restaurantId)
        .maybeSingle(),
    ]);
    for (const res of [tableRes, pickupRes, bookingRes, payBillRes, merchantRes]) {
      if (res.error) return serverError(res.error);
    }

    const bills = billsInRange(
      [
        ...(tableRes.data || []).map(tableBill),
        ...(pickupRes.data || []).map(pickupBill),
        ...(bookingRes.data || []).map(bookingBill),
        ...(payBillRes.data || []).map(payBillBill),
      ],
      start,
      end
    ).sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const staffIds = [...new Set(bills.map((b) => b.staff_id).filter(Boolean))];
    if (staffIds.length) {
      const { data: staff } = await admin.from("users").select("id,full_name").in("id", staffIds);
      const names = new Map((staff || []).map((u) => [u.id, u.full_name]));
      for (const bill of bills) bill.staff_name = names.get(bill.staff_id) || null;
    }
    for (const bill of bills) delete bill.staff_id;

    return reply({ ok: true, bills, day: summarize(bills), merchant: merchantRes.data || null });
  } catch (error) {
    return serverError(error);
  }
}
