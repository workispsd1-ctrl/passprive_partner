"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImageOff, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const MAX_FILES = 10;
const MAX_FILE = 15 * 1024 * 1024;
const norm = (s) => String(s || "").trim().toLowerCase();
const fmt = (n) => `MUR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function api(body) {
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const res = await fetch("/api/restaurant/menu-import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");
  return json;
}

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function mergeSections(into, more) {
  const out = [...into];
  for (const s of more) {
    const same = out.find((x) => norm(x.name) === norm(s.name) && x.group === s.group);
    if (same) same.items.push(...s.items.filter((i) => !same.items.some((j) => norm(j.name) === norm(i.name))));
    else out.push({ ...s, items: [...s.items] });
  }
  return out;
}

export default function MenuImport({ restaurantId, menu, areas, menuCardImages = [], disabled, onApply }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [useCards, setUseCards] = useState(false);
  const [progress, setProgress] = useState("");
  const [plan, setPlan] = useState(null);
  const [photosOn, setPhotosOn] = useState(true);

  const existing = new Map((menu?.sections || []).map((s) => [`${norm(s.name)}|${s.group === "Bar" ? "Bar" : "Kitchen"}`, s]));
  const isDuplicate = (section, item) => {
    const s = existing.get(`${norm(section.name)}|${section.group}`);
    return Boolean(s && (s.items || []).some((i) => norm(i.name) === norm(item.name)));
  };

  const reset = () => {
    setFiles([]);
    setUseCards(false);
    setProgress("");
    setPlan(null);
  };

  const close = () => {
    if (progress) return;
    reset();
    setOpen(false);
  };

  const read = async () => {
    const sources = [...files.map((f) => ({ file: f })), ...(useCards ? menuCardImages.map((url) => ({ url })) : [])];
    if (!sources.length) return toast.error("Pick a photo or PDF of your menu.");
    let sections = [];
    let failed = 0;
    for (let k = 0; k < sources.length; k += 1) {
      setProgress(`Reading page ${k + 1} of ${sources.length}…`);
      try {
        const src = sources[k];
        const payload = src.file
          ? { file: { name: src.file.name, type: src.file.type, data: await toBase64(src.file) } }
          : { url: src.url };
        const json = await api({ action: "read", restaurant_id: restaurantId, ...payload });
        sections = mergeSections(sections, json.sections || []);
      } catch (e) {
        failed += 1;
        toast.error(`Page ${k + 1}: ${e.message}`);
      }
    }
    if (!sections.length) {
      setProgress("");
      return;
    }
    setProgress("Finding photos…");
    const queries = [...new Set(sections.flatMap((s) => s.items.map((i) => norm(i.photo_query))))];
    let photos = {};
    let available = true;
    for (let k = 0; k < queries.length; k += 40) {
      try {
        const json = await api({ action: "photos", restaurant_id: restaurantId, queries: queries.slice(k, k + 40) });
        available = json.available !== false;
        photos = { ...photos, ...(json.photos || {}) };
        if (!available) break;
      } catch {
        break;
      }
    }
    setPhotosOn(available);
    setPlan({
      sections: sections.map((s, si) => ({
        ...s,
        key: `s${si}`,
        items: s.items.map((i, ii) => {
          const dup = isDuplicate(s, i);
          const options = photos[norm(i.photo_query)] || [];
          return { ...i, key: `s${si}i${ii}`, on: !dup, dup, options, pick: options.length ? 0 : -1 };
        }),
      })),
    });
    setProgress("");
    if (failed) toast.error(`${failed} page${failed === 1 ? "" : "s"} could not be read. The rest is ready to check.`);
  };

  const patchItem = (key, patch) =>
    setPlan((p) => ({ ...p, sections: p.sections.map((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })) }));
  const setSection = (key, on) =>
    setPlan((p) => ({ ...p, sections: p.sections.map((s) => (s.key === key ? { ...s, items: s.items.map((i) => (i.dup ? i : { ...i, on })) } : s)) }));

  const chosen = plan ? plan.sections.flatMap((s) => s.items.filter((i) => i.on)) : [];

  const apply = async () => {
    if (!chosen.length) return;
    setProgress("Saving photos…");
    const ids = new Map(chosen.map((i) => [i.key, crypto.randomUUID()]));
    const urls = new Map();
    const withPhoto = chosen.filter((i) => i.pick >= 0 && i.options[i.pick]);
    for (let k = 0; k < withPhoto.length; k += 4) {
      setProgress(`Saving photos ${Math.min(k + 4, withPhoto.length)} of ${withPhoto.length}…`);
      await Promise.all(
        withPhoto.slice(k, k + 4).map(async (i) => {
          try {
            const json = await api({ action: "save_photo", restaurant_id: restaurantId, item_id: ids.get(i.key), url: i.options[i.pick].full });
            if (json.url) urls.set(i.key, json.url);
          } catch {}
        })
      );
    }
    setProgress("Adding to your menu…");
    const areaFor = (group) => (areas.find((a) => (a.menus || []).includes(group)) || areas[0])?.id || null;
    const sections = [...(menu?.sections || [])].map((s) => ({ ...s, items: [...(s.items || [])] }));
    let added = 0;
    for (const s of plan.sections) {
      const items = s.items
        .filter((i) => i.on)
        .map((i) => {
          const variants = i.variants.map((v) => ({ id: crypto.randomUUID(), name: v.name, price: v.price }));
          added += 1;
          return {
            id: ids.get(i.key),
            name: i.name,
            kitchen_label: null,
            description: i.description || null,
            price: variants.length ? Math.min(...variants.map((v) => v.price)) : i.price,
            variants,
            image_urls: urls.has(i.key) ? [urls.get(i.key)] : [],
            is_veg: i.is_veg === true,
            is_bestseller: false,
            is_available: true,
            subcategory_id: null,
            modifier_groups: [],
            comment_presets: [],
          };
        });
      if (!items.length) continue;
      const same = sections.find((x) => norm(x.name) === norm(s.name) && (x.group === "Bar" ? "Bar" : "Kitchen") === s.group);
      if (same) same.items.push(...items);
      else sections.push({ id: crypto.randomUUID(), name: s.name, description: null, group: s.group, menu_area_id: areaFor(s.group), comment_presets: [], subcategories: [], items });
    }
    try {
      await onApply({ ...menu, sections, updated_at: new Date().toISOString() });
      toast.success(`${added} dish${added === 1 ? "" : "es"} added to your menu.`);
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e?.message || "Couldn't save the menu.");
      setProgress("");
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#FF4800] bg-white px-3 text-sm font-semibold text-[#FF4800] hover:bg-orange-50 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" /> Import menu with AI
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">{plan ? "Check the dishes to add" : "Import your menu"}</h3>
              <button type="button" onClick={close} disabled={Boolean(progress)} aria-label="Close" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {progress ? (
                <div className="flex flex-col items-center gap-3 py-16 text-sm font-semibold text-gray-700">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FF4800]" />
                  {progress}
                </div>
              ) : !plan ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Upload photos or PDFs of your printed menu. We read the sections, dishes, prices and sizes, and suggest a photo for each dish. Nothing is added until you check it. Dishes already on your menu are skipped.
                  </p>
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center hover:border-[#FF4800]">
                    <span className="text-sm font-semibold text-gray-800">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose photos or PDFs"}</span>
                    <span className="text-xs text-gray-500">Up to {MAX_FILES} files, 15 MB each. One page per photo reads best.</span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        const big = picked.find((f) => f.size > MAX_FILE);
                        if (big) toast.error(`${big.name} is over 15 MB.`);
                        setFiles(picked.filter((f) => f.size <= MAX_FILE).slice(0, MAX_FILES));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {menuCardImages.length ? (
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={useCards} onChange={(e) => setUseCards(e.target.checked)} />
                      Also read the {menuCardImages.length} menu photo{menuCardImages.length === 1 ? "" : "s"} already uploaded on this page
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-5">
                  {!photosOn ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Photo suggestions are not set up yet. Dishes are added without photos.</p> : null}
                  {plan.sections.map((s) => {
                    const free = s.items.filter((i) => !i.dup);
                    const allOn = free.length > 0 && free.every((i) => i.on);
                    return (
                      <div key={s.key} className="rounded-2xl border border-gray-200">
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <input type="checkbox" checked={allOn} disabled={!free.length} onChange={(e) => setSection(s.key, e.target.checked)} />
                            {s.name}
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">{s.group}</span>
                          </label>
                          <span className="text-xs text-gray-500">{s.items.length} dishes</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {s.items.map((i) => {
                            const photo = i.pick >= 0 ? i.options[i.pick] : null;
                            return (
                              <div key={i.key} className={`flex items-center gap-3 px-4 py-2.5 ${i.dup ? "opacity-50" : ""}`}>
                                <input type="checkbox" checked={i.on} disabled={i.dup} onChange={(e) => patchItem(i.key, { on: e.target.checked })} />
                                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                                  {photo ? <img src={photo.thumb} alt="" className="h-full w-full object-cover" /> : <ImageOff className="m-auto mt-4 h-5 w-5 text-gray-300" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-gray-900">{i.name}</div>
                                  <div className="truncate text-xs text-gray-500">
                                    {i.variants.length ? i.variants.map((v) => `${v.name} ${fmt(v.price)}`).join(" · ") : fmt(i.price)}
                                    {i.description ? ` · ${i.description}` : ""}
                                  </div>
                                  {i.dup ? <div className="text-xs font-semibold text-gray-500">Already on your menu, skipped</div> : null}
                                </div>
                                {!i.dup && i.options.length ? (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      aria-label="Previous photo"
                                      onClick={() => patchItem(i.key, { pick: i.pick <= 0 ? i.options.length - 1 : i.pick - 1 })}
                                      className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Next photo"
                                      onClick={() => patchItem(i.key, { pick: (i.pick + 1) % i.options.length })}
                                      className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => patchItem(i.key, { pick: i.pick >= 0 ? -1 : 0 })}
                                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                    >
                                      {i.pick >= 0 ? "No photo" : "Use photo"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {photosOn ? (
                    <p className="text-xs text-gray-400">
                      Suggested photos from{" "}
                      <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">
                        Pexels
                      </a>
                      . They show a typical dish, not yours. Replace them with your own photos when you can.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {!progress ? (
              <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
                <button type="button" onClick={plan ? () => setPlan(null) : close} className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">
                  {plan ? "Back" : "Cancel"}
                </button>
                {plan ? (
                  <button
                    type="button"
                    onClick={apply}
                    disabled={!chosen.length}
                    className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#FF4800] text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> Add {chosen.length} dish{chosen.length === 1 ? "" : "es"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={read}
                    disabled={!files.length && !useCards}
                    className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#FF4800] text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" /> Read menu
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
