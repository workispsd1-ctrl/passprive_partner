"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";

const JOBS = [
  { key: "kitchen", label: "Kitchen tickets", hint: "Orders from Kitchen menus" },
  { key: "bar", label: "Bar tickets", hint: "Orders from Bar menus" },
  { key: "receipts", label: "Customer receipts & bills", hint: "Part receipts and final bills" },
];

const EMPTY = { id: "", name: "", ip: "", port: 9100, paper_mm: 80, prints: [], is_active: true };
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const inputCls = "h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-300";

export default function PrintersPage() {
  const [restaurantId, setRestaurantId] = useState("");
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState("");

  const load = async () => {
    const id = await getActiveRestaurantId();
    setRestaurantId(id || "");
    if (!id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabaseBrowser
      .from("restaurant_printers")
      .select("id, name, ip, port, paper_mm, prints, is_active, created_at")
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
      prints: JOBS.map((j) => j.key).filter((k) => draft.prints.includes(k)),
      is_active: draft.is_active,
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
      const { data: sess } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/restaurant/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token || ""}` },
        body: JSON.stringify({ action: "test", printer_id: p.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Test print failed.");
      toast.success(`Test sent to ${p.name}. It prints within a few seconds.`);
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
          onClick={() => setDraft({ ...EMPTY })}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FF4800] px-4 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add printer
        </button>
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
                    {p.ip}:{p.port} · {p.paper_mm} mm
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
