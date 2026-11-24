"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageUp, Loader2, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

const JOBS = [
  { key: "kitchen", label: "Kitchen tickets", hint: "Orders from Kitchen menus" },
  { key: "bar", label: "Bar tickets", hint: "Orders from Bar menus" },
  { key: "receipts", label: "Customer receipts & bills", hint: "Part receipts and final bills" },
];

const EMPTY = { id: "", name: "", ip: "", port: 9100, paper_mm: 80, prints: [], is_active: true, backup_printer_id: "", bottom_feed_mm: 0 };
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const inputCls = "h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-300";
const SCAN_ERRORS = {
  no_device: "No PassPrive till or POS answered. Make sure the app is open, signed in and connected to the restaurant Wi-Fi.",
  no_network: "The till or POS is not connected to Wi-Fi.",
  printer_unreachable: "That printer did not answer. Check it is switched on.",
  printer_timeout: "That printer did not answer. Check it is switched on.",
};
const scanError = (code) => SCAN_ERRORS[code] || "The search did not finish. Try again.";

async function printersApi(body) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const res = await fetch("/api/restaurant/printers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");
  return json;
}

async function receiptApi(body) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const res = await fetch("/api/restaurant/receipt-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");
  return json.settings;
}

function ReceiptDetails({ restaurantId }) {
  const [settings, setSettings] = useState(null);
  const [vat, setVat] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    receiptApi({ action: "get", restaurant_id: restaurantId })
      .then((next) => {
        setSettings(next);
        setVat(next.vat_number);
      })
      .catch((e) => toast.error(e.message));
  }, [restaurantId]);

  const run = async (key, body, done) => {
    setBusy(key);
    try {
      const next = await receiptApi({ ...body, restaurant_id: restaurantId });
      setSettings(next);
      setVat(next.vat_number);
      toast.success(done);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  };

  const pickLogo = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("The image is too large. Use one under 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => run("logo", { action: "upload_logo", image: String(reader.result || "") }, "Logo saved. It will print on all tickets and bills.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Receipt details</h2>
      <p className="text-sm text-gray-600">Your logo prints at the top of order receipts, bills and every other printout. The VAT number prints on the final invoice.</p>
      {!settings ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-gray-900">Logo</div>
            <div className="mt-2 grid h-32 place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              {settings.logo ? (
                <div className="w-full max-w-[288px] rounded bg-white py-3 shadow-sm">
                  <img src={settings.logo.png} alt="Printed logo preview" className="mx-auto" style={{ width: `${Math.min(100, (settings.logo.width / 576) * 100)}%`, imageRendering: "pixelated" }} />
                </div>
              ) : (
                <span className="text-sm text-gray-500">No logo yet</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">Shown at its printed size on an 80 mm receipt: about the size the restaurant name used to print. Black and white only; a dark logo on a white or transparent background prints best.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#FF4800] px-4 text-sm font-semibold text-white">
                {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {settings.logo ? "Change logo" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={Boolean(busy)} onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {settings.logo ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => run("remove", { action: "remove_logo" }, "Logo removed.")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700"
                >
                  {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-900" htmlFor="vat-number">VAT number</label>
            <input id="vat-number" className={`${inputCls} mt-2`} placeholder="e.g. 20497279" value={vat} onChange={(e) => setVat(e.target.value.replace(/\s+/g, "").slice(0, 20))} />
            <p className="mt-1 text-xs text-gray-500">Printed on the final invoice with your BRN{settings.brn ? ` (${settings.brn})` : ""}.</p>
            <button
              type="button"
              disabled={Boolean(busy) || vat === settings.vat_number}
              onClick={() => run("vat", { action: "set_vat", vat_number: vat }, "VAT number saved.")}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === "vat" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save VAT number
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function waitForPos(restaurantId, id) {
  for (let i = 0; i < 70; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const { request } = await printersApi({ action: "discovery_status", restaurant_id: restaurantId, id });
    if (request.status !== "pending") return request;
  }
  return { status: "failed", error: "no_device" };
}

export default function PrintersPage() {
  const [restaurantId, setRestaurantId] = useState("");
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState("");
  const [scan, setScan] = useState({ state: "idle", found: [], subnet: "", error: "" });
  const [ipTest, setIpTest] = useState("");
  const [extraNet, setExtraNet] = useState("");

  useEffect(() => {
    try {
      setExtraNet(window.localStorage.getItem("printers:extraNet") || "");
    } catch {}
  }, []);

  const findPrinters = async () => {
    setScan({ state: "searching", found: [], subnet: "", error: "" });
    try {
      try {
        window.localStorage.setItem("printers:extraNet", extraNet);
      } catch {}
      const { request } = await printersApi({ action: "scan", restaurant_id: restaurantId, networks: extraNet });
      const done = await waitForPos(restaurantId, request.id);
      if (done.status !== "done") return setScan({ state: "failed", found: [], subnet: "", error: scanError(done.error) });
      setScan({ state: "done", found: done.result?.found || [], subnet: done.result?.subnet || "", error: "" });
    } catch (e) {
      setScan({ state: "failed", found: [], subnet: "", error: e?.message || scanError() });
    }
  };

  const testFound = async (f) => {
    setIpTest(f.ip);
    try {
      const { request } = await printersApi({ action: "test_ip", restaurant_id: restaurantId, ip: f.ip, port: f.port });
      const done = await waitForPos(restaurantId, request.id);
      if (done.status !== "done") throw new Error(scanError(done.error));
      toast.success(`Printed on ${f.ip}. The printer that printed “This printer is ${f.ip}” is this one.`);
    } catch (e) {
      toast.error(e?.message || "Test print failed.");
    } finally {
      setIpTest("");
    }
  };

  const addedAs = (f) => printers.find((p) => p.ip === f.ip && Number(p.port || 9100) === Number(f.port || 9100));

  const load = async () => {
    const id = await getActiveRestaurantId();
    setRestaurantId(id || "");
    if (!id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabaseBrowser
      .from("restaurant_printers")
      .select("id, name, ip, port, paper_mm, prints, is_active, backup_printer_id, bottom_feed_mm, created_at")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) return toast.error(error.message || "Could not load printers.");
    setPrinters(data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const routing = useMemo(() => {
    const live = printers.filter((p) => p.is_active);
    return JOBS.map((j) => {
      const names = live.filter((p) => (p.prints || []).includes(j.key)).map((p) => p.name);
      return { ...j, where: names.length ? names.join(", ") : "Not printed — no printer chosen" };
    });
  }, [printers]);

  const ipError = draft && draft.ip && !IP_RE.test(draft.ip.trim()) ? "Enter an address like 192.168.100.103" : "";
  const ready = draft && draft.name.trim() && IP_RE.test(draft.ip.trim()) && Number(draft.port) > 0;

  const save = async () => {
    if (!ready || !restaurantId) return;
    setSaving(true);
    const row = {
      restaurant_id: restaurantId,
      name: draft.name.trim().slice(0, 40),
      ip: draft.ip.trim(),
      port: Number(draft.port) || 9100,
      paper_mm: Number(draft.paper_mm) === 58 ? 58 : 80,
      bottom_feed_mm: Math.max(0, Math.min(100, Math.round(Number(draft.bottom_feed_mm) || 0))),
      prints: JOBS.map((j) => j.key).filter((k) => draft.prints.includes(k)),
      is_active: draft.is_active,
      backup_printer_id: draft.backup_printer_id && draft.backup_printer_id !== draft.id ? draft.backup_printer_id : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await supabaseBrowser.from("restaurant_printers").update(row).eq("id", draft.id)
      : await supabaseBrowser.from("restaurant_printers").insert(row);
    setSaving(false);
    if (error) return toast.error(error.message || "Could not save the printer.");
    toast.success(draft.id ? "Printer updated." : "Printer added.");
    setDraft(null);
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name}? What it prints will stop printing until another printer takes it over.`)) return;
    const { error } = await supabaseBrowser.from("restaurant_printers").delete().eq("id", p.id);
    if (error) return toast.error(error.message || "Could not remove the printer.");
    toast.success("Printer removed.");
    load();
  };

  const test = async (p) => {
    setTesting(p.id);
    try {
      const { request } = await printersApi({ action: "test_ip", restaurant_id: restaurantId, ip: p.ip, port: p.port });
      const done = await waitForPos(restaurantId, request.id);
      if (done.status !== "done") throw new Error(scanError(done.error));
      toast.success(`${p.name} printed the test page.`);
    } catch (e) {
      toast.error(e?.message || "Test print failed.");
    } finally {
      setTesting("");
    }
  };

  const toggleJob = (key) =>
    setDraft((d) => ({ ...d, prints: d.prints.includes(key) ? d.prints.filter((k) => k !== key) : [...d.prints, key] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#FF4800]/10 text-[#FF4800]">
            <Printer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Printers</h1>
            <p className="text-sm text-gray-600">Add your network printers, name them, and choose what each one prints.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY, backup_printer_id: printers.find((b) => b.is_active && (b.prints || []).includes("receipts"))?.id || "" })}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FF4800] px-4 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add printer
        </button>
      </div>

      <ReceiptDetails restaurantId={restaurantId} />

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Find printers on the restaurant Wi-Fi</div>
            <p className="mt-0.5 text-xs text-gray-500">
              The PassPrive till (or POS) open at the restaurant searches its Wi-Fi for network printers. Takes about 10 seconds.
            </p>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              Also search network (optional)
              <input
                value={extraNet}
                onChange={(e) => setExtraNet(e.target.value.replace(/[^\d.,\s/]/g, "").slice(0, 60))}
                placeholder="e.g. 192.168.8"
                className="h-8 w-40 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-gray-300"
              />
              <span className="text-gray-400">Only if your printers use a different network range from the Wi-Fi.</span>
            </label>
          </div>
          <button
            type="button"
            disabled={!restaurantId || scan.state === "searching"}
            onClick={findPrinters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            {scan.state === "searching" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scan.state === "searching" ? "Searching…" : scan.state === "idle" ? "Find printers" : "Search again"}
          </button>
        </div>
        {scan.state === "failed" ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{scan.error}</p> : null}
        {scan.state === "done" ? (
          scan.found.length === 0 ? (
            <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
              No network printers found on {scan.subnet || "the restaurant Wi-Fi"}. Check the printer is on and connected to the same Wi-Fi or router.
              If the printer&apos;s IP starts differently (e.g. 192.168.8.x), type that range (192.168.8) in “Also search network” and search again.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100">
              {scan.found.map((f) => {
                const added = addedAs(f);
                return (
                  <div key={`${f.ip}:${f.port}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        {f.ip}
                        <span className="text-gray-400">:{f.port}</span>
                      </div>
                      <div className={`text-xs ${added ? "text-emerald-700" : "text-gray-500"}`}>{added ? `Added as “${added.name}”` : "Not added yet"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={Boolean(ipTest)}
                        onClick={() => testFound(f)}
                        className="h-9 rounded-xl border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        {ipTest === f.ip ? "Printing…" : "Test print"}
                      </button>
                      {added ? null : (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...EMPTY,
                              ip: f.ip,
                              port: f.port || 9100,
                              backup_printer_id: printers.find((b) => b.is_active && (b.prints || []).includes("receipts"))?.id || "",
                            })
                          }
                          className="h-9 rounded-xl bg-[#FF4800] px-3 text-sm font-semibold text-white"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">What prints where</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {routing.map((r) => (
            <div key={r.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-500">{r.label}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{r.where}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          The PassPrive POS terminal sends everything to these printers over the restaurant Wi-Fi. The POS itself only prints its card
          and MauCas payment slips.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading printers…
          </div>
        ) : printers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No printers yet. Add your first printer, e.g. “Main counter · 192.168.100.103”.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {printers.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    {!p.is_active ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">Off</span> : null}
                  </div>
                  <div className="text-sm text-gray-500">
                    {p.ip}:{p.port} · {p.paper_mm} mm{p.bottom_feed_mm ? ` · +${p.bottom_feed_mm} mm space` : ""}
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.backup_printer_id && printers.some((b) => b.id === p.backup_printer_id)
                      ? `If it doesn't respond: prints on ${printers.find((b) => b.id === p.backup_printer_id).name}`
                      : "No backup printer"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(p.prints || []).length ? (
                      JOBS.filter((j) => p.prints.includes(j.key)).map((j) => (
                        <span key={j.key} className="rounded-full bg-[#FF4800]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B83400]">
                          {j.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">Prints nothing yet</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={testing === p.id}
                    onClick={() => test(p)}
                    className="h-9 rounded-xl border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testing === p.id ? "Sending…" : "Test print"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => setDraft({ ...EMPTY, ...p, prints: p.prints || [] })}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => remove(p)}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {draft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !saving && setDraft(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-gray-900">{draft.id ? "Edit printer" : "Add printer"}</div>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Name</span>
                <input
                  value={draft.name}
                  maxLength={40}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Main counter, Kitchen, Bar"
                  className={`mt-1 ${inputCls}`}
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="text-xs font-semibold text-gray-600">IP address</span>
                  <input
                    value={draft.ip}
                    inputMode="decimal"
                    onChange={(e) => setDraft((d) => ({ ...d, ip: e.target.value.replace(/[^\d.]/g, "") }))}
                    placeholder="192.168.100.103"
                    className={`mt-1 ${inputCls} ${ipError ? "border-rose-300" : ""}`}
                  />
                  {ipError ? <span className="mt-1 block text-[11px] text-rose-600">{ipError}</span> : null}
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Port</span>
                  <input
                    value={draft.port}
                    inputMode="numeric"
                    onChange={(e) => setDraft((d) => ({ ...d, port: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-600">Paper width</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[80, 58].map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, paper_mm: mm }))}
                      className={`h-10 rounded-xl border text-sm font-semibold ${Number(draft.paper_mm) === mm ? "border-[#FF4800] bg-[#FF4800] text-white" : "border-gray-200 text-gray-700"}`}
                    >
                      {mm} mm
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Blank space at the bottom of each ticket (mm)</span>
                <input
                  inputMode="numeric"
                  value={String(draft.bottom_feed_mm ?? 0)}
                  onChange={(e) => setDraft((d) => ({ ...d, bottom_feed_mm: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  className={`mt-1 ${inputCls}`}
                />
                <span className="mt-1 block text-xs text-gray-500">0 to 100 mm. 20 mm = 2 cm of empty paper before the cut.</span>
              </label>
              <div>
                <span className="text-xs font-semibold text-gray-600">What this printer prints</span>
                <div className="mt-1 grid gap-2">
                  {JOBS.map((j) => {
                    const on = draft.prints.includes(j.key);
                    return (
                      <button
                        key={j.key}
                        type="button"
                        onClick={() => toggleJob(j.key)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left ${on ? "border-[#FF4800] bg-[#FFF6F1]" : "border-gray-200"}`}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">{j.label}</span>
                          <span className="block text-xs text-gray-500">{j.hint}</span>
                        </span>
                        <span className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] font-bold ${on ? "border-[#FF4800] bg-[#FF4800] text-white" : "border-gray-300"}`}>
                          {on ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">If this printer doesn&apos;t respond, print on</span>
                <select
                  value={draft.backup_printer_id || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, backup_printer_id: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">No backup (keep retrying this printer)</option>
                  {printers
                    .filter((b) => b.id !== draft.id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.ip}
                        {b.is_active ? "" : " (off)"}
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-xs text-gray-500">
                  The ticket prints there with a “BACKUP PRINT” banner so staff carry it over. It never prints twice.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
                Printer is on
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} disabled={saving} className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!ready || saving}
                className="h-10 rounded-xl bg-[#FF4800] px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save printer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
