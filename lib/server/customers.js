const PLACEHOLDER_NAMES = ["walk-in", "walk in", "staff order", "guest"];

const cleanName = (name) => {
  const n = String(name || "").trim();
  return PLACEHOLDER_NAMES.includes(n.toLowerCase()) ? "" : n;
};

const cleanPhone = (phone) => String(phone || "").replace(/[^\d+]/g, "");

export function groupCustomers(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = cleanName(row.name);
    const phone = cleanPhone(row.phone);
    const digits = phone.replace(/\D/g, "");
    if (row.cancelled || (!name && digits.length < 7)) continue;
    const key = digits.length >= 7 ? `p${digits.slice(-8)}` : `n${name.toLowerCase()}`;
    const group = groups.get(key) || { id: key, name: "", phone: "", visits: 0, spent_cents: 0, last_visit: "" };
    const newest = row.at > group.last_visit;
    if (name && (newest || !group.name)) group.name = name;
    if (digits.length >= 7 && (newest || !group.phone)) group.phone = phone;
    group.visits += 1;
    if (row.paid) group.spent_cents += Math.round(Number(row.amount || 0) * 100);
    if (newest) group.last_visit = row.at;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ spent_cents, ...group }) => ({ ...group, spent: spent_cents / 100 }))
    .sort((a, b) => b.last_visit.localeCompare(a.last_visit));
}
