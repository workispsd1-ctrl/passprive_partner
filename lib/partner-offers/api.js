import { getTokenClient } from "@/lib/getTokenClient";

function resolveApiBase() {
  const browserBase = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const serverBase = process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2 || "";

  if (typeof window === "undefined") return serverBase || browserBase || "";

  const appHost = window.location.hostname;
  const browserLooksLocal =
    browserBase.includes("localhost") || browserBase.includes("127.0.0.1");
  const appIsLocal = appHost === "localhost" || appHost === "127.0.0.1";

  if (!appIsLocal && browserLooksLocal) {
    return serverBase || "";
  }

  return browserBase || serverBase || "";
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request(path, options = {}) {
  const url = `${resolveApiBase()}${path}`;
  const token = await getTokenClient();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      try {
        const text = await response.text();
        if (text) message = `${message}: ${text.slice(0, 200)}`;
      } catch {}
    }
    message = `${message} [${path}]`;
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function getOffers(params = {}) {
  return request(`/api/offers${buildQuery(params)}`);
}

export function getOffer(id) {
  return request(`/api/offers/${id}`);
}

export function createOffer(payload) {
  return request("/api/offers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOffer(id, payload) {
  return request(`/api/offers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteOffer(id) {
  return request(`/api/offers/${id}`, {
    method: "DELETE",
  });
}

export function getOfferTargets(id) {
  return request(`/api/offers/${id}/targets`);
}

export function createOfferTarget(id, payload) {
  return request(`/api/offers/${id}/targets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteOfferTarget(id, targetId) {
  return request(`/api/offers/${id}/targets/${targetId}`, {
    method: "DELETE",
  });
}

export function getOfferConditions(id) {
  return request(`/api/offers/${id}/conditions`);
}

export function createOfferCondition(id, payload) {
  return request(`/api/offers/${id}/conditions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOfferCondition(id, conditionId, payload) {
  return request(`/api/offers/${id}/conditions/${conditionId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteOfferCondition(id, conditionId) {
  return request(`/api/offers/${id}/conditions/${conditionId}`, {
    method: "DELETE",
  });
}

export function getOfferUsageLimit(id) {
  return request(`/api/offers/${id}/usage-limit`);
}

export function updateOfferUsageLimit(id, payload) {
  return request(`/api/offers/${id}/usage-limit`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function testStoreApplicable(storeId, params = {}) {
  return request(`/api/offers/applicable/store/${storeId}${buildQuery(params)}`);
}

export function testRestaurantApplicable(restaurantId, params = {}) {
  return request(`/api/offers/applicable/restaurant/${restaurantId}${buildQuery(params)}`);
}
