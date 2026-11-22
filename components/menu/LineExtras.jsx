export function extrasText(it) {
  const mods = (Array.isArray(it?.modifiers) ? it.modifiers : []).map((m) => m?.name).filter(Boolean);
  return [mods.length ? `+ ${mods.join(", ")}` : "", it?.note ? `“${it.note}”` : "", it?.guest ? `for ${it.guest}` : ""].filter(Boolean).join(" · ");
}

export default function LineExtras({ line, className = "" }) {
  const mods = (Array.isArray(line?.modifiers) ? line.modifiers : []).map((m) => m?.name).filter(Boolean);
  if (!mods.length && !line?.note && !line?.guest) return null;
  return (
    <span className={`block text-xs font-normal ${className}`}>
      {mods.length ? <span className="block text-slate-500">+ {mods.join(", ")}</span> : null}
      {line?.note ? <span className="block font-semibold text-amber-700">“{line.note}”</span> : null}
      {line?.guest ? <span className="block font-semibold text-blue-700">for {line.guest}</span> : null}
    </span>
  );
}
