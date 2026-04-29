const DEFAULT_BACKEND_URL = "https://api.passprive.com";
const REQUEST_TIMEOUT_MS = 15000;

function getBackendBaseUrl() {
  return (process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

async function withTimeoutFetch(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {object} payload
 * @returns {Promise<{
 * ok: boolean,
 * payment_session_id: string,
 * tracking_id: string,
 * merchant_trace: string,
 * redirect_url: string,
 * payload: { method: string, fields: Record<string, string> }
 * }>}
 */
export async function createPublicMenuSession(payload) {
  const url = `${getBackendBaseUrl()}/api/public-menu/payments/create-session`;
  const res = await withTimeoutFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || "Unable to start payment session.");
  }
  return data;
}

/**
 * @param {{ payment_session_id?: string, tracking_id?: string }} payload
 * @returns {Promise<{
 * ok: boolean,
 * status: string,
 * payment_session_id?: string,
 * tracking_id?: string,
 * table_booking_id?: string
 * }>}
 */
export async function finalizePublicMenuPayment(payload) {
  const url = `${getBackendBaseUrl()}/api/public-menu/payments/finalize`;
  const res = await withTimeoutFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || "Unable to finalize payment.");
  }
  return data;
}

