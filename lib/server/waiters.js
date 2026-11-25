export const WAITER_ROLES = ["restaurant_waiter", "restaurant_bearer", "waiter", "bearer"];

export async function listWaiters(admin, restaurantId) {
  const { data: staff, error } = await admin
    .from("restaurant_staff")
    .select("user_id, role")
    .eq("restaurant_id", restaurantId)
    .in("role", WAITER_ROLES);
  if (error) throw error;
  const ids = [...new Set((staff || []).map((s) => s.user_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: users, error: uErr } = await admin.from("users").select("id, full_name").in("id", ids);
  if (uErr) throw uErr;
  const names = new Map((users || []).map((u) => [u.id, String(u.full_name || "").trim()]));
  return ids
    .map((id) => ({ id, name: names.get(id) || "Waiter" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pickWaiter(waiters, { callerId, callerIsWaiter, waiterId }) {
  if (callerIsWaiter) {
    const me = waiters.find((w) => w.id === callerId);
    return { waiter: me || { id: callerId, name: "Waiter" } };
  }
  if (waiterId) {
    const chosen = waiters.find((w) => w.id === String(waiterId));
    return chosen ? { waiter: chosen } : { error: "That waiter is not on your staff list." };
  }
  if (!waiters.length) return { waiter: null };
  return { error: "Pick the waiter." };
}

export async function resolveWaiter(admin, restaurantId, opts) {
  return pickWaiter(await listWaiters(admin, restaurantId), opts);
}

export const waiterStamp = (waiter, at = new Date().toISOString()) => (waiter ? { id: waiter.id, name: waiter.name, at } : null);
