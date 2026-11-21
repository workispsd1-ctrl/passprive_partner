"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { MAX_NOTE, publicModifierGroups, publicVariants } from "@/lib/server/menuPricing";

function rule(g) {
  if (g.min > 0 && g.min === g.max) return `Required · pick ${g.min}`;
  if (g.min > 0) return `Required · pick ${g.min} to ${g.max}`;
  return g.max === 1 ? "Optional · pick 1" : `Optional · up to ${g.max}`;
}

export default function CustomiseDialog({ item, money, onClose, onAdd, initialVariantId = "" }) {
  const groups = useMemo(() => (item ? publicModifierGroups(item).filter((g) => g.options.length) : []), [item]);
  const variants = useMemo(() => (item ? publicVariants(item) : []), [item]);
  const [variantId, setVariantId] = useState(initialVariantId);
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const toggle = (g, id) =>
    setPicked((prev) => {
      const cur = prev[g.id] || [];
      if (cur.includes(id)) return { ...prev, [g.id]: cur.filter((x) => x !== id) };
      if (g.max === 1) return { ...prev, [g.id]: [id] };
      return cur.length >= g.max ? prev : { ...prev, [g.id]: [...cur, id] };
    });

  const variant = variants.find((v) => v.id === variantId) || null;
  const slotsOf = (g) => (g.per_pick && variant?.picks ? variant.picks : 0);
  const pickSlot = (g, i, id) =>
    setPicked((prev) => {
      const cur = [...(prev[g.id] || [])];
      cur[i] = id;
      return { ...prev, [g.id]: cur };
    });
  const missing = groups.filter((g) => {
    const n = slotsOf(g);
    if (n) return Array.from({ length: n }, (_, i) => (picked[g.id] || [])[i]).some((x) => !x);
    if (g.per_pick && variants.length) return false;
    return (picked[g.id] || []).length < g.min;
  });
  const mods = groups.flatMap((g) => {
    const n = slotsOf(g);
    if (n) return (picked[g.id] || []).slice(0, n).map((id) => g.options.find((o) => o.id === id)).filter(Boolean);
    if (g.per_pick && variants.length) return [];
    return g.options.filter((o) => (picked[g.id] || []).includes(o.id));
  });
  const needVariant = variants.length > 0 && !variant;
  const unit = Number(variant ? variant.price : item.price || 0) + mods.reduce((s, m) => s + Number(m.price || 0), 0);

  const submit = () => {
    if (missing.length || needVariant) return setTried(true);
    onAdd(mods, note.trim(), qty, variant);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-slate-900">{item.name}</div>
            <div className="text-sm text-slate-500">
              {variants.length ? `from ${money(Math.min(...variants.map((v) => v.price)))}` : money(item.price)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-lg hover:bg-slate-100 grid place-items-center">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4">
          {variants.length ? (
            <fieldset className="space-y-2">
              <legend className="flex w-full items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">Choose one</span>
                <span className={`text-xs font-medium ${tried && needVariant ? "text-rose-600" : "text-slate-500"}`}>Required · pick 1</span>
              </legend>
              {variants.map((v) => {
                const on = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setVariantId(v.id)}
                    className={`w-full min-h-[52px] flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                      on ? "border-[#DA3224] bg-rose-50" : tried && needVariant ? "border-rose-300" : "border-slate-200"
                    }`}
                  >
                    <span className={`h-5 w-5 shrink-0 grid place-items-center rounded-full border-2 ${on ? "border-[#DA3224] bg-[#DA3224]" : "border-slate-400"}`}>
                      {on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{v.is_veg ? "🌿 " : ""}{v.name}</span>
                      {v.description ? <span className="block text-xs text-slate-500">{v.description}</span> : null}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{money(v.price)}</span>
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          {groups.map((g) => {
            const sel = picked[g.id] || [];
            const bad = tried && missing.includes(g);
            if (g.per_pick && variants.length) {
              const n = slotsOf(g);
              return (
                <fieldset key={g.id} className="space-y-2">
                  <legend className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{g.name}</span>
                    <span className={`text-xs font-medium ${bad ? "text-rose-600" : "text-slate-500"}`}>
                      {n ? `Required · one per scoop (${n})` : "Choose a size first"}
                    </span>
                  </legend>
                  {Array.from({ length: n }, (_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-600">
                        {g.name} {i + 1}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {g.options.map((o) => {
                          const on = sel[i] === o.id;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => pickSlot(g, i, o.id)}
                              className={`min-h-[40px] rounded-full border px-3 text-sm font-medium ${
                                on ? "border-[#DA3224] bg-[#DA3224] text-white" : bad && !sel[i] ? "border-rose-300 text-slate-800" : "border-slate-200 text-slate-800"
                              }`}
                            >
                              {o.name}
                              {o.price > 0 ? ` +${money(o.price)}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </fieldset>
              );
            }
            return (
              <fieldset key={g.id} className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{g.name}</span>
                  <span className={`text-xs font-medium ${bad ? "text-rose-600" : "text-slate-500"}`}>{rule(g)}</span>
                </legend>
                {g.options.map((o) => {
                  const on = sel.includes(o.id);
                  const full = !on && g.max > 1 && sel.length >= g.max;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role={g.max === 1 ? "radio" : "checkbox"}
                      aria-checked={on}
                      disabled={full}
                      onClick={() => toggle(g, o.id)}
                      className={`w-full min-h-[48px] flex items-center gap-3 rounded-xl border px-3 text-left disabled:opacity-40 ${
                        on ? "border-[#DA3224] bg-rose-50" : bad ? "border-rose-300" : "border-slate-200"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 shrink-0 grid place-items-center border-2 ${g.max === 1 ? "rounded-full" : "rounded-md"} ${
                          on ? "border-[#DA3224] bg-[#DA3224]" : "border-slate-400"
                        }`}
                      >
                        {on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 text-sm font-medium text-slate-900">{o.name}</span>
                      {o.price > 0 ? <span className="text-sm text-slate-500">+{money(o.price)}</span> : null}
                    </button>
                  );
                })}
              </fieldset>
            );
          })}

          <label className="block">
            <span className="text-sm font-bold text-slate-900">Comment for the kitchen</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder="e.g. No onions, sauce on the side"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
          <div className="inline-flex items-center gap-2">
            <button type="button" aria-label="Less" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-10 w-10 rounded-lg border border-slate-200 grid place-items-center">
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[20px] text-center font-semibold">{qty}</span>
            <button type="button" aria-label="More" onClick={() => setQty((q) => Math.min(50, q + 1))} className="h-10 w-10 rounded-lg border border-slate-200 grid place-items-center">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            className={`flex-1 h-11 rounded-xl bg-[#DA3224] px-3 text-sm font-semibold text-white ${missing.length || needVariant ? "opacity-60" : "hover:opacity-90"}`}
          >
            {needVariant ? "Choose one" : missing.length && tried ? `Choose ${missing[0].name}` : `Add · ${money(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
