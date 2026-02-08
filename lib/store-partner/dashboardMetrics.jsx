/**
 * Replace this when you share orders/products schema.
 * For now it's client-ready with safe values.
 */

export async function fetchDashboardKPIs(storeId) {
  if (!storeId) return emptyKPIs();

  return {
    revenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    activeProducts: 0,
    lowStock: 0,
  };
}

export async function fetchRecentActivity(storeId) {
  if (!storeId) return [];
  return [];
}

function emptyKPIs() {
  return {
    revenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    activeProducts: 0,
    lowStock: 0,
  };
}
