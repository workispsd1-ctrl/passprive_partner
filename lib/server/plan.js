// Server-side service checks. The dashboard hides pages by plan; these stop the APIs behind them.
// "booking" and "payments" restaurants have staff, bookings and floor tools; only "payments"
// restaurants take table orders and bill payments.
export const STAFF_PLANS = ["booking", "payments"];
export const PAY_BILL_PLANS = ["payments"];

export const NOT_IN_PLAN = "This feature isn't included in your restaurant's service.";

export async function restaurantHasPlan(admin, restaurantId, plans = STAFF_PLANS) {
  if (!restaurantId) return false;
  const { data, error } = await admin.from("restaurants").select("service_level").eq("id", restaurantId).maybeSingle();
  if (error) throw error;
  return plans.includes(String(data?.service_level || "").toLowerCase());
}
