const PENDING_MS = 2 * 60 * 1000;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const FIELDS = "id, kind, ip, port, status, result, error, created_at, updated_at";

export const isIp = (v) => IPV4.test(String(v || ""));

const PRIVATE_NET = /^(10\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}|192\.168\.\d{1,3})$/;

export function cleanNetworks(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || "").split(/[\s,]+/)) {
    const net = String(raw || "").trim().replace(/(\.0)?(\/24)?$/, "").replace(/\.$/, "");
    if (PRIVATE_NET.test(net) && net.split(".").every((n) => Number(n) <= 255) && !out.includes(net)) out.push(net);
  }
  return out.slice(0, 3);
}

export function cleanFound(found) {
  const seen = new Set();
  return (Array.isArray(found) ? found : [])
    .map((f) => ({ ip: String(f?.ip ?? f ?? ""), port: Number(f?.port) || 9100 }))
    .filter((f) => isIp(f.ip) && f.port > 0 && f.port < 65536 && !seen.has(`${f.ip}:${f.port}`) && seen.add(`${f.ip}:${f.port}`))
    .slice(0, 64);
}

export async function discoveryDeviceOnline(admin, restaurantId) {
  const { data } = await admin
    .from("pos_terminals")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .gte("discovery_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(1);
  return Boolean(data?.length);
}

export async function requestDiscovery(admin, restaurantId, userId, { kind, ip, port, networks }) {
  const row = { restaurant_id: restaurantId, kind, requested_by: userId || null, networks: kind === "scan" ? cleanNetworks(networks) : [] };
  if (kind === "test") {
    if (!isIp(ip)) return { error: "Enter a valid IP address." };
    Object.assign(row, { ip, port: Number(port) > 0 && Number(port) < 65536 ? Number(port) : 9100 });
  }
  const { data, error } = await admin.from("printer_discovery").insert(row).select(FIELDS).single();
  if (error) throw error;
  return { request: data };
}

export async function pendingDiscovery(admin, restaurantId) {
  const { data } = await admin
    .from("printer_discovery")
    .select("id, kind, ip, port, networks")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - PENDING_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(3);
  return data || [];
}

export async function finishDiscovery(admin, restaurantId, terminalId, body) {
  const ok = body?.ok === true;
  const update = {
    status: ok ? "done" : "failed",
    handled_by: terminalId,
    updated_at: new Date().toISOString(),
    result: ok && body?.kind === "scan" ? { subnet: String(body?.subnet || "").slice(0, 32), found: cleanFound(body?.found) } : null,
    error: ok ? null : String(body?.error || "failed").slice(0, 120),
  };
  const { error } = await admin
    .from("printer_discovery")
    .update(update)
    .eq("id", String(body?.id || ""))
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function markDiscoveryCapable(admin, terminalId) {
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  await admin
    .from("pos_terminals")
    .update({ discovery_at: new Date().toISOString() })
    .eq("id", terminalId)
    .or(`discovery_at.is.null,discovery_at.lt.${minuteAgo}`);
}

export async function discoveryStatus(admin, restaurantId, id) {
  const { data, error } = await admin.from("printer_discovery").select(FIELDS).eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw error;
  if (data?.status === "pending" && Date.now() - new Date(data.created_at).getTime() > PENDING_MS) {
    return { ...data, status: "failed", error: "no_device" };
  }
  return data;
}
