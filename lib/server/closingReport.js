const FR = {
  "Period closing": "Clôture de période",
  Period: "Période",
  "Cancelled bills": "Notes supprimées",
  "Cancelled orders": "Commandes annulées",
  "Item deletions": "Suppressions d'articles",
  "Total incl. VAT": "Total TTC",
  Tickets: "Tickets",
  Avg: "Moy",
  Refunds: "Extourne",
  Categories: "Rubriques",
  "Users (Payments)": "Utilisateurs (Règlements)",
  "Users (Sales)": "Utilisateurs (Ventes)",
  "Payment methods": "Modes de règlement",
  CASH: "ESPÈCES",
  "CHANGE GIVEN": "RENDU MONNAIE",
  "NET CASH": "ESPÈCES NET",
  "VAT rate": "Taux VAT",
  "STANDARD RATE": "TAUX NORMAL",
  "HT = {ht} / TTC = {ttc}": "HT = {ht} / TTC = {ttc}",
  "Sales modes": "Modes de vente",
  Offered: "Offerts",
  Quantity: "Quantité",
  Total: "Total",
  Tips: "Pourboires",
  Discounts: "Remises",
  "Discounted bills": "Notes remisées",
  "Before discounts": "Avant remises",
  "Table bookings": "Réservations",
  Bookings: "Réservations",
  Confirmed: "Confirmées",
  Arrived: "Arrivées",
  "No-show": "Absents",
  Cancelled: "Annulées",
  Covers: "Couverts",
  Deposits: "Acomptes",
  Takeaway: "À emporter",
  Orders: "Commandes",
  Collected: "Retirées",
  "Avg prep": "Préparation moy.",
  "Customer accounts": "Comptes clients",
  "Received on accounts": "Reçu sur comptes",
  "Best sellers": "Meilleures ventes",
  Service: "Service",
  Guests: "Couverts",
  "Per guest": "Par couvert",
  "Avg time at table": "Temps moyen à table",
  "Busiest hour": "Heure la plus chargée",
  "Compared with": "Comparaison",
  Change: "Évolution",
  "Printed by": "Imprimé par",
  Unknown: "Inconnu",
  "ON ACCOUNT": "SUR COMPTE",
  "CARD": "CARTE BANCAIRE",
  "MAUCAS": "MAUCAS",
  "JUICE": "JUICE",
  "CHEQUE": "CHÈQUE",
  "AVOIR": "AVOIR",
  "ONLINE": "EN LIGNE",
  "BANK": "VIREMENT",
  "SPLIT": "PARTAGÉ",
  "DINE-IN": "SUR PLACE",
  "QR ORDERS": "COMMANDES QR",
  "PICKUP": "À EMPORTER",
  "APP PAY BILL": "PAIEMENT APP",
  "TABLE BOOKINGS": "RÉSERVATIONS",
  min: "min",
  "Items sold": "Articles vendus",
  "Total units": "Total unités",
  units: "unités",
  "Every bill": "Tous les tickets",
  "excl. VAT": "HT",
  VAT: "TVA",
  Other: "Autre",
};

const EN_METHODS = { CASH: "CASH", CARD: "CARD", MAUCAS: "MAUCAS", JUICE: "JUICE", CHEQUE: "CHEQUE", AVOIR: "CREDIT NOTE", ACCOUNT: "ON ACCOUNT", ONLINE: "ONLINE", BANK: "BANK", SPLIT: "SPLIT", OFFERED: "OFFERED" };
const FR_METHODS = { ACCOUNT: "SUR COMPTE", AVOIR: "AVOIR", OFFERED: "OFFERT" };
const CHANNELS = { dine_in: "DINE-IN", qr: "QR ORDERS", pickup: "PICKUP", pay_bill: "APP PAY BILL", booking: "TABLE BOOKINGS" };

export function closingReport(stats, { from, to, lang = "en", merchant = null, names = {}, refunds = 0, printedAt = new Date(), printedBy = null, area = null, sales = [] }) {
  const fr = lang === "fr";
  const t = (k, vars = {}) => Object.entries(vars).reduce((out, [a, b]) => out.split(`{${a}}`).join(String(b)), fr ? FR[k] || k : k);
  const money = (v) => {
    const n = Number(v || 0);
    return fr ? `${n.toFixed(2).replace(".", ",")}Rs` : `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}Rs`;
  };
  const plain = (v) => (fr ? Number(v || 0).toFixed(2).replace(".", ",") : Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const method = (k) => (fr ? FR_METHODS[k] || t(EN_METHODS[k] || k) : EN_METHODS[k] || k);
  const who = (id) => String(names[id] || t("Unknown")).toUpperCase();
  const dayName = (d) => {
    const s = new Date(`${d}T12:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const stamp = new Date(printedAt.getTime() + 4 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const j = stats.journal;
  const L = [];
  const rule = () => L.push({ rule: true });
  const big = (text) => L.push({ text, size: 26, bold: true, center: true });
  const head = (text) => L.push({ text, bold: true }, { text: " " });
  const line = (text, bold = false) => L.push(bold ? { text, bold: true } : { text });

  if (merchant?.name) L.push({ text: merchant.name, size: 30, bold: true, center: true });
  if (merchant?.full_address) L.push({ text: String(merchant.full_address).toUpperCase(), center: true });
  if (merchant?.phone) L.push({ text: merchant.phone, center: true });
  rule();
  big(t("Period closing"));
  L.push({ text: from === to ? dayName(from) : `${dayName(from)} - ${dayName(to)}`, bold: true, center: true });
  L.push({ text: stamp, center: true });
  if (area || printedBy) L.push({ text: [area, printedBy ? `${t("Printed by")} ${printedBy}` : ""].filter(Boolean).join(" / "), center: true });
  rule();
  line(`${t("Cancelled bills")} : ${stats.losses.cancelled}`);
  line(`${t("Cancelled orders")} : ${stats.collect?.cancelled || 0}`);
  line(`${t("Item deletions")} : ${stats.losses.voided_items}`);
  big(t("Period"));
  rule();
  line(`${t("Total incl. VAT")} : ${money(j.total)}`, true);
  line(`${j.bills} ${t("Tickets")}    ${t("Avg")} : ${money(j.average)}`, true);
  line(`${refunds} ${t("Refunds")}`, true);
  rule();

  head(t("Categories"));
  for (const c of [...stats.categories].sort((a, b) => a.name.localeCompare(b.name))) line(`${c.qty} ${String(c.name).toUpperCase()} : ${money(c.amount)}`);
  rule();

  if (stats.payers?.length) {
    head(t("Users (Payments)"));
    for (const u of stats.payers) {
      line(`${who(u.id)} : ${plain(u.total)}`);
      for (const m of u.methods) line(`     ${method(m.key)} : ${plain(m.amount)}`);
    }
    rule();
  }
  if (stats.sellers?.length) {
    head(t("Users (Sales)"));
    for (const u of stats.sellers) line(`${who(u.id)} : ${plain(u.total)}`);
    rule();
  }

  head(t("Payment methods"));
  const counts = stats.method_counts || {};
  const cashTotal = stats.methods.find((m) => m.key === "CASH")?.amount || 0;
  if (cashTotal || stats.cash?.received) {
    line(`${t("CASH")} : ${money(stats.cash?.received ?? cashTotal)}`);
    line(`${t("CHANGE GIVEN")} : ${money(-(stats.cash?.change || 0))}`);
    line(`${t("NET CASH")} : ${money(stats.cash?.net ?? cashTotal)}`, true);
    line(" ");
  }
  for (const m of stats.methods.filter((x) => x.key !== "CASH")) line(`${counts[m.key] ? `${counts[m.key]} ` : ""}${method(m.key)} : ${plain(m.amount)}`);
  rule();

  head(t("VAT rate"));
  line(`${t("STANDARD RATE")} ${j.vat_rate.toFixed(2).replace(".", fr ? "," : ".")}% : ${money(j.vat)}`, true);
  line(t("HT = {ht} / TTC = {ttc}", { ht: money(j.excl_vat), ttc: money(j.total) }));
  rule();

  head(t("Sales modes"));
  for (const c of stats.channels) line(`${(merchant?.name && c.key === "dine_in" ? merchant.name : t(CHANNELS[c.key] || c.key)).toUpperCase()} : ${plain(c.amount)}`, true);
  line(`${t("STANDARD RATE")} ${j.vat_rate.toFixed(2).replace(".", fr ? "," : ".")}% : ${plain(j.vat)}`, true);
  line(t("HT = {ht} / TTC = {ttc}", { ht: plain(j.excl_vat), ttc: plain(j.total) }));
  rule();

  head(t("Offered"));
  line(`${t("Quantity")} : ${j.offered_qty || 0}`);
  line(`${t("Total")} : ${money(j.offered_value || 0)}${j.offered_qty ? ` (${t("Avg")} : ${money((j.offered_value || 0) / j.offered_qty)})` : ""}`);
  rule();

  head(t("Tips"));
  line(`${t("Total")} : ${money(j.tips)}`, true);
  for (const m of stats.tip_methods || []) line(`     ${method(m.key)} : ${plain(m.amount)}`);
  rule();

  head(t("Discounts"));
  line(`${t("Discounted bills")} : ${j.discounted_bills || 0}`);
  line(`${t("Total")} : ${money(j.discounts || 0)}`);
  line(`${t("Before discounts")} : ${money(j.before_discounts || j.total)}`);
  rule();

  const b = stats.bookings;
  if (b) {
    head(t("Table bookings"));
    line(`${t("Bookings")} : ${b.total}`, true);
    line(`${t("Confirmed")} : ${b.confirmed}`);
    line(`${t("Arrived")} : ${b.completed || 0}`);
    line(`${t("No-show")} : ${b.no_show}`);
    line(`${t("Cancelled")} : ${b.cancelled}`);
    line(`${t("Covers")} : ${b.covers}`);
    line(`${t("Deposits")} : ${money(b.deposits)}`);
    rule();
  }

  const c = stats.collect;
  if (c && (c.orders || c.cancelled)) {
    head(t("Takeaway"));
    line(`${t("Orders")} : ${c.orders}`, true);
    line(`${t("Collected")} : ${c.collected}`);
    line(`${t("Cancelled")} : ${c.cancelled}`);
    line(`${t("Total")} : ${money(c.value)}`);
    if (c.prep_minutes != null) line(`${t("Avg prep")} : ${c.prep_minutes} ${t("min")}`);
    rule();
  }

  if (stats.account_payments?.count) {
    head(t("Customer accounts"));
    line(`${t("Received on accounts")} : ${money(stats.account_payments.total)}`, true);
    for (const m of stats.account_payments.methods) line(`     ${method(m.key)} : ${plain(m.amount)}`);
    rule();
  }

  head(t("Service"));
  line(`${t("Guests")} : ${j.guests}`);
  line(`${t("Per guest")} : ${money(j.per_guest)}`);
  if (stats.service?.table_minutes != null) line(`${t("Avg time at table")} : ${stats.service.table_minutes} ${t("min")}`);
  if (stats.service?.busiest_hour != null) line(`${t("Busiest hour")} : ${String(stats.service.busiest_hour).padStart(2, "0")}h`);
  rule();

  const units = stats.items.reduce((n, i) => n + Number(i.qty || 0), 0);
  head(t("Items sold"));
  line(`${t("Total units")} : ${units} ${t("units")}`, true);
  const byCategory = new Map();
  for (const i of stats.items) byCategory.set(i.category || t("Other"), [...(byCategory.get(i.category || t("Other")) || []), i]);
  for (const [name, list] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const qty = list.reduce((n, i) => n + Number(i.qty || 0), 0);
    line(" ");
    line(`${String(name).toUpperCase()} (${qty} ${t("units")})`, true);
    for (const i of [...list].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))) line(`${i.qty} ${String(i.name).toUpperCase()} : ${plain(i.amount)}`);
  }
  rule();

  const best = [...stats.items].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 10);
  if (best.length) {
    head(t("Best sellers"));
    best.forEach((i, n) => line(`${n + 1}. ${i.qty} ${String(i.name).toUpperCase()} : ${plain(i.amount)}`));
    rule();
  }

  if (stats.compare) {
    head(t("Compared with"));
    line(`${stats.compare.from} - ${stats.compare.to} : ${money(stats.compare.total)}`);
    line(`${t("Change")} : ${stats.compare.change_pct == null ? "-" : `${stats.compare.change_pct > 0 ? "+" : ""}${stats.compare.change_pct}%`}`, true);
    rule();
  }

  if (sales.length) {
    const clock = (at) => new Date(new Date(at).getTime() + 4 * 3600 * 1000).toISOString().slice(11, 16);
    head(`${t("Every bill")} (${sales.length})`);
    for (const sale of [...sales].sort((a, b) => new Date(a.at) - new Date(b.at))) {
      const where = sale.table ? `T${sale.table}` : t(CHANNELS[sale.channel] || sale.channel);
      line(`${clock(sale.at)} ${where} ${method(sale.method)} : ${plain(sale.amount / 100)}`, true);
      line(`     ${t("excl. VAT")} ${plain((sale.amount - sale.tax) / 100)} / ${t("VAT")} ${plain(sale.tax / 100)}`);
    }
    rule();
  }

  return { title: t("Period closing"), period: from === to ? dayName(from) : `${dayName(from)} - ${dayName(to)}`, lines: L };
}
