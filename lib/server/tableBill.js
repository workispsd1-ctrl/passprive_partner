const upper = (value) => String(value || "").trim().toUpperCase();

export function isBillPaid(row) {
  return ["PAID", "COMPLETED"].includes(upper(row?.payment_status)) || upper(row?.booking_status) === "PAID";
}

export function isBillCancelled(row) {
  return upper(row?.booking_status) === "CANCELLED";
}

export function isBillClosed(row) {
  return isBillPaid(row) || isBillCancelled(row);
}

export function bookingStatusChangeError(row, nextBooking, nextPayment = "") {
  const booking = upper(row?.booking_status);
  const next = upper(nextBooking);
  const payment = upper(nextPayment);
  if (booking === "CANCELLED") return "This order was cancelled and cannot be changed.";
  if (booking === "PAID" && next && next !== "PAID") return "This bill is already paid and cannot be reopened.";
  if (isBillPaid(row) && payment === "PENDING") return "This bill is already paid and cannot be reopened.";
  if (isBillPaid(row) && next === "CANCELLED") return "A paid bill cannot be cancelled here. Refund it first.";
  return null;
}

export function quickPaymentRecord(row, by, at) {
  const due = Number(row?.total_amount || 0);
  return { method: "CASH", amount_due: due, amount_received: due, change: 0, reference: null, by, at, via: "quick_mark" };
}
