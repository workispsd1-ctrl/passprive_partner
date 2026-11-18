"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { MAX_NOTE, publicModifierGroups } from "@/lib/server/menuPricing";

function rule(g) {
  if (g.min > 0 && g.min === g.max) return `Required · pick ${g.min}`;
  if (g.min > 0) return `Required · pick ${g.min} to ${g.max}`;
  return g.max === 1 ? "Optional · pick 1" : `Optional · up to ${g.max}`;
}

export default function CustomiseDialog({ item, money, onClose, onAdd }) {
  const groups = useMemo(() => (item ? publicModifierGroups(item).filter((g) => g.options.length) : []), [item]);
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

  const missing = groups.filter((g) => (picked[g.id] || []).length < g.min);
  const mods = groups.flatMap((g) => g.options.filter((o) => (picked[g.id] || []).includes(o.id)));
  const unit = Number(item.price || 0) + mods.reduce((s, m) => s + Number(m.price || 0), 0);

  const submit = () => {
    if (missing.length) return setTried(true);
    onAdd(mods, note.trim(), qty);
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
            <div className="text-sm text-slate-500">{money(item.price)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-lg hover:bg-slate-100 grid place-items-center">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4">
          {groups.map((g) => {
            const sel = picked[g.id] || [];
            const bad = tried && missing.includes(g);
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
            className={`flex-1 h-11 rounded-xl bg-[#DA3224] px-3 text-sm font-semibold text-white ${missing.length ? "opacity-60" : "hover:opacity-90"}`}
          >
            {missing.length && tried ? `Choose ${missing[0].name}` : `Add · ${money(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
