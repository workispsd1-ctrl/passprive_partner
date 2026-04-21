import { getTokenClient } from "@/lib/getTokenClient";

function resolveApiBase() {
  const browserBase = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const serverBase = process.env.NEXT_PUBLIC_BACKEND_URL_FOR_EC2 || "";

  if (typeof window === "undefined") return serverBase || browserBase || "";

  const appHost = window.location.hostname;
  const browserLooksLocal = browserBase.includes("localhost") || browserBase.includes("127.0.0.1");
  const appIsLocal = appHost === "localhost" || appHost === "127.0.0.1";

  if (!appIsLocal && browserLooksLocal) return serverBase || "";

  return browserBase || serverBase || "";
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
    throw new Error(`${message} [${path}]`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function getStoreServices(storeId) {
  return request(`/api/stores/${storeId}/services`);
}

export function createStoreService(storeId, payload) {
  return request(`/api/stores/${storeId}/services`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStoreService(storeId, serviceId, payload) {
  return request(`/api/stores/${storeId}/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteStoreService(storeId, serviceId) {
  return request(`/api/stores/${storeId}/services/${serviceId}`, {
    method: "DELETE",
  });
}
