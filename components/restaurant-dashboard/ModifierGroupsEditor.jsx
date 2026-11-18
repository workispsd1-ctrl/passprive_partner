"use client";

import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

const priceInput = (v) => String(v ?? "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 9);

export function newGroup() {
  return { id: uid(), name: "", min: 0, max: 1, options: [newOption()] };
}

function newOption() {
  return { id: uid(), name: "", price: "", is_available: true };
}

export function modifierGroupsError(groups) {
  for (const g of groups) {
    const label = g.name.trim() || "A customisation group";
    if (!g.name.trim()) return "Give every customisation group a name.";
    const options = g.options.filter((o) => o.name.trim());
    if (!options.length) return `${label} needs at least one option.`;
    if (options.some((o) => !Number.isFinite(Number(o.price || 0)) || Number(o.price || 0) < 0)) return `${label} has an invalid price.`;
    if (g.min > options.length) return `${label} asks for ${g.min} picks but has ${options.length} options.`;
    if (g.max < Math.max(1, g.min)) return `${label}: the maximum must be at least the minimum.`;
  }
  return "";
}

export function cleanModifierGroups(groups) {
  return groups.map((g) => {
    const options = g.options
      .filter((o) => o.name.trim())
      .map((o) => ({
        id: o.id,
        name: o.name.trim().slice(0, 80),
        price: Math.round(Number(o.price || 0) * 100) / 100,
        is_available: o.is_available !== false,
      }));
    const min = Math.max(0, Math.min(Number(g.min) || 0, options.length));
    const max = Math.max(Math.max(1, min), Math.min(Number(g.max) || 1, options.length));
    return { id: g.id, name: g.name.trim().slice(0, 80), min, max, options };
  });
}

export function toEditableGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((g) => ({
    id: g.id || uid(),
    name: g.name || "",
    min: Number(g.min) || 0,
    max: Number(g.max) || 1,
    options: (Array.isArray(g.options) ? g.options : []).map((o) => ({
      id: o.id || uid(),
      name: o.name || "",
      price: o.price ? String(o.price) : "",
      is_available: o.is_available !== false,
    })),
  }));
}

function ruleText(g) {
  const n = g.options.filter((o) => o.name.trim()).length;
  if (g.min > 0 && g.min === g.max) return `Customer must pick ${g.min}`;
  if (g.min > 0) return `Customer must pick ${g.min} to ${g.max}`;
  return g.max >= n && n > 1 ? "Optional, any number" : `Optional, up to ${g.max}`;
}

const input = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-300";
const iconBtn = "h-9 w-9 shrink-0 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center disabled:opacity-40";

export default function ModifierGroupsEditor({ groups, onChange }) {
  const setGroup = (gi, patch) => onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setOption = (gi, oi, patch) =>
    setGroup(gi, { options: groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const move = (gi, dir) => {
    const next = [...groups];
    const to = gi + dir;
    if (to < 0 || to >= next.length) return;
    [next[gi], next[to]] = [next[to], next[gi]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {groups.map((g, gi) => {
        const count = g.options.filter((o) => o.name.trim()).length;
        return (
          <div key={g.id} className="rounded-xl border border-gray-200 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={g.name}
                onChange={(e) => setGroup(gi, { name: e.target.value })}
                placeholder="Group name, e.g. Size, Sauce, Extras"
                className={input}
              />
              <button type="button" onClick={() => move(gi, -1)} disabled={gi === 0} className={iconBtn} aria-label="Move up">
                <ChevronUp className="h-4 w-4 text-gray-700" />
              </button>
              <button type="button" onClick={() => move(gi, 1)} disabled={gi === groups.length - 1} className={iconBtn} aria-label="Move down">
                <ChevronDown className="h-4 w-4 text-gray-700" />
              </button>
              <button type="button" onClick={() => onChange(groups.filter((_, i) => i !== gi))} className={`${iconBtn} hover:bg-red-50`} aria-label="Delete group">
                <Trash2 className="h-4 w-4 text-red-600" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2 font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={g.min > 0}
                  onChange={(e) => setGroup(gi, { min: e.target.checked ? 1 : 0, max: Math.max(g.max, 1) })}
                />
                Required
              </label>
              {g.min > 0 ? (
                <label className="inline-flex items-center gap-2 text-gray-600">
                  Min
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, count)}
                    value={g.min}
                    onChange={(e) => {
                      const min = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
                      setGroup(gi, { min, max: Math.max(g.max, min) });
                    }}
                    className="h-9 w-16 rounded-lg border border-gray-200 px-2"
                  />
                </label>
              ) : null}
              <label className="inline-flex items-center gap-2 text-gray-600">
                Max
                <input
                  type="number"
                  min={Math.max(1, g.min)}
                  max={Math.max(1, count)}
                  value={g.max}
                  onChange={(e) => setGroup(gi, { max: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })}
                  className="h-9 w-16 rounded-lg border border-gray-200 px-2"
                />
              </label>
              <span className="text-xs text-gray-500">{ruleText(g)}</span>
            </div>

            <div className="space-y-2">
              {g.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    value={o.name}
                    onChange={(e) => setOption(gi, oi, { name: e.target.value })}
                    placeholder="Option, e.g. Large"
                    className={`${input} ${o.is_available === false ? "text-gray-400 line-through" : ""}`}
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">+ MUR</span>
                    <input
                      value={o.price}
                      onChange={(e) => setOption(gi, oi, { price: priceInput(e.target.value) })}
                      inputMode="decimal"
                      placeholder="0"
                      className={`${input} pl-14`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOption(gi, oi, { is_available: o.is_available === false })}
                    className={iconBtn}
                    aria-label={o.is_available === false ? "Show option" : "Hide option"}
                    title={o.is_available === false ? "Sold out. Click to show" : "Mark sold out"}
                  >
                    {o.is_available === false ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-700" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                    disabled={g.options.length === 1}
                    className={`${iconBtn} hover:bg-red-50`}
                    aria-label="Delete option"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setGroup(gi, { options: [...g.options, newOption()] })}
                className="h-9 rounded-xl border border-dashed border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add option
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...groups, newGroup()])}
        className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 text-sm font-semibold inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add customisation group
      </button>
    </div>
  );
}

export function toEditableVariants(variants) {
  return (Array.isArray(variants) ? variants : []).map((v) => ({
    id: v.id || uid(),
    name: v.name || "",
    description: v.description || "",
    price: v.price != null ? String(v.price) : "",
    is_veg: v.is_veg === true,
    is_available: v.is_available !== false,
  }));
}

export function variantsError(variants) {
  for (const v of variants) {
    if (!v.name.trim()) return "Give every variant a name.";
    if (v.price === "" || !Number.isFinite(Number(v.price)) || Number(v.price) < 0) return `Enter a price for ${v.name.trim()}.`;
  }
  return "";
}

export function cleanVariants(variants) {
  return variants.map((v) => ({
    id: v.id,
    name: v.name.trim().slice(0, 120),
    description: v.description.trim().slice(0, 200) || null,
    price: Math.round(Number(v.price) * 100) / 100,
    is_veg: v.is_veg,
    is_available: v.is_available !== false,
  }));
}

export function VariantsEditor({ variants, onChange }) {
  const set = (i, patch) => onChange(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= variants.length) return;
    const next = [...variants];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {variants.map((v, i) => (
        <div key={v.id} className={`rounded-xl border border-gray-200 p-3 space-y-2 ${v.is_available === false ? "bg-gray-50" : ""}`}>
          <div className="flex items-center gap-2">
            <input
              value={v.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder="e.g. Marlin Fumé à la Crème et Oignons"
              className={`${input} ${v.is_available === false ? "text-gray-400 line-through" : ""}`}
            />
            <div className="relative w-32 shrink-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">MUR</span>
              <input
                value={v.price}
                onChange={(e) => set(i, { price: priceInput(e.target.value) })}
                inputMode="decimal"
                placeholder="690"
                className={`${input} pl-11`}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={v.description}
              onChange={(e) => set(i, { description: e.target.value })}
              placeholder="Description (optional), e.g. Smoked Marlin with Cream and Onions"
              className={input}
            />
            <button
              type="button"
              onClick={() => set(i, { is_veg: !v.is_veg })}
              className={`h-9 shrink-0 rounded-xl border px-2 text-xs font-semibold ${v.is_veg ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-500"}`}
            >
              Veg
            </button>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up">
              <ChevronUp className="h-4 w-4 text-gray-700" />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === variants.length - 1} className={iconBtn} aria-label="Move down">
              <ChevronDown className="h-4 w-4 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={() => set(i, { is_available: v.is_available === false })}
              className={iconBtn}
              title={v.is_available === false ? "Sold out. Click to show" : "Mark sold out"}
              aria-label={v.is_available === false ? "Show variant" : "Hide variant"}
            >
              {v.is_available === false ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-700" />}
            </button>
            <button type="button" onClick={() => onChange(variants.filter((_, j) => j !== i))} className={`${iconBtn} hover:bg-red-50`} aria-label="Delete variant">
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...variants, { id: uid(), name: "", description: "", price: "", is_veg: false, is_available: true }])}
        className="h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 text-sm font-semibold inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add variant
      </button>
    </div>
  );
}
