"use client";

export function Card({ title, subtitle, right, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}
        </div>
        {right || null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</div>
        {hint ? <div className="text-[11px] text-gray-400">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function Select(props) {
  return (
    <select
      {...props}
      className={[
        "h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[110px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        disabled ? "border-gray-200 bg-gray-50 opacity-70" : "border-gray-200 bg-white",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300"
      />
      <span className="block">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-gray-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function Badge({ children, tone = "gray" }) {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-gray-200 bg-gray-50 text-gray-700";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}
