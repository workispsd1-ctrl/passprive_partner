const STAFF_SOURCES = ["cashier", "staff_pad", "staff", "staff_order"];

export function isStaffPlacedOrder(o) {
  if (STAFF_SOURCES.includes(String(o?.source || "").toLowerCase())) return true;
  const d = o?.order_details && typeof o.order_details === "object" ? o.order_details : o?.metadata;
  if (!d || typeof d !== "object") return false;
  return (
    d.source_channel === "cashier_orders" ||
    d.created_by === "cashier" ||
    d.placed_by === "staff_pad" ||
    d.is_staff_initiated === true ||
    Boolean(d.staff_user_id)
  );
}
