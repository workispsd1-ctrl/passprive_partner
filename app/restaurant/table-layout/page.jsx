"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Table2,
  X,
  Pencil,
  Lock,
  MapPin,
  Armchair,
  Users,
  Move,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getActiveRestaurantId } from "@/lib/restaurant-partner/activeRestaurant";
import { AREA_KINDS, areaKindMeta as kindMeta, sortAreas } from "@/lib/restaurant-partner/tableAreas";
import { toast } from "sonner";

const SHAPES = [
  { value: "circle", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rectangle", label: "Long" },
];
const CAPACITIES = [2, 4, 6, 8, 10, 12];

// Floor maps are drawn on a 16:10 canvas; table sizes are designed for this width and scale with it.
const BASE_CANVAS_W = 960;
const UNASSIGNED = "__unassigned__";
const GRADIENT = "linear-gradient(91.59deg, #FF4800 2.56%, #FFA680 97.05%)";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function sizeForShape(shape) {
  if (shape === "circle") return { w: 110, h: 110 };
  if (shape === "rectangle") return { w: 156, h: 96 };
  return { w: 124, h: 124 };
}

function chairPositions(shape, capacity) {
  const n = Math.max(2, Number(capacity) || 2);
  if (shape === "rectangle") {
    const top = Math.ceil(n / 2);
    const bottom = n - top;
    const points = [];
    for (let i = 0; i < top; i += 1) points.push({ x: ((i + 1) / (top + 1)) * 100, y: -10 });
    for (let i = 0; i < bottom; i += 1) points.push({ x: ((i + 1) / (bottom + 1)) * 100, y: 110 });
    return points;
  }

  return Array.from({ length: n }).map((_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 62;
    return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
  });
}

function friendlyError(error, fallback) {
  if (error?.code === "23505") {
    if (String(error?.message || "").includes("table_no")) return "That table number is already used.";
    return "An area with that name already exists.";
  }
  if (error?.code === "23503") return "Move or delete this area's tables before deleting it.";
  if (error?.code === "42P01" || error?.code === "42703") {
    return "Table areas aren't set up in the database yet. Run the 20261022_restaurant_table_areas migration.";
  }
  return error?.message || fallback;
}

// First grid slot in the area that isn't already close to another table.
function findFreeSpot(areaTables) {
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const x = 12 + col * 15;
      const y = 15 + row * 15;
      const taken = areaTables.some((t) => Math.abs(t.pos_x - x) < 10 && Math.abs(t.pos_y - y) < 12);
      if (!taken) return { x, y };
    }
  }
  return { x: 50, y: 50 };
}

function TableShape({ shape, capacity, label, sublabel, scale = 1, className = "", style }) {
  const size = sizeForShape(shape);
  const chairs = chairPositions(shape, capacity);
  return (
    <div
      className={`relative flex flex-col items-center justify-center bg-white text-gray-900 ${className}`}
      style={{
        width: size.w * scale,
        height: size.h * scale,
        borderRadius: shape === "circle" ? 999 : 14 * scale,
        ...style,
      }}
    >
      {chairs.map((c, idx) => (
        <span
          key={idx}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-300 bg-[#FFF7F4]"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: 14 * scale, height: 14 * scale }}
        />
      ))}
      {label ? (
        <div className="pointer-events-none max-w-[85%] truncate font-bold" style={{ fontSize: 13 * scale }}>
          {label}
        </div>
      ) : null}
      {sublabel ? (
        <div className="pointer-events-none text-gray-500" style={{ fontSize: 11 * scale }}>
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-gray-700" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function PrimaryButton({ children, loading, className = "", ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(255,72,0,0.18)] transition hover:opacity-95 disabled:opacity-60 ${className}`}
      style={{ background: GRADIENT }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-gray-500">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#FF4800] focus:ring-2 focus:ring-[#FF4800]/15 disabled:bg-gray-50 disabled:text-gray-500";

function KindPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {AREA_KINDS.map((k) => {
        const Icon = k.icon;
        const active = value === k.value;
        return (
          <button
            key={k.value}
            type="button"
            onClick={() => onChange(k.value)}
            aria-pressed={active}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition ${
              active
                ? "border-[#FF4800] bg-[#FFF7F4] text-[#FF4800] ring-2 ring-[#FF4800]/15"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-5 w-5" />
            {k.label}
          </button>
        );
      })}
    </div>
  );
}

function ShapePicker({ value, capacity, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SHAPES.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            aria-pressed={active}
            className={`flex flex-col items-center gap-2 rounded-xl border px-2 pb-2 pt-4 text-xs font-semibold transition ${
              active
                ? "border-[#FF4800] bg-[#FFF7F4] text-[#FF4800] ring-2 ring-[#FF4800]/15"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-14 items-center justify-center">
              <TableShape shape={s.value} capacity={capacity} scale={0.36} className="ring-1 ring-gray-300" />
            </div>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function SeatPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {CAPACITIES.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={active}
            className={`h-10 rounded-xl border text-sm font-semibold transition ${
              active
                ? "border-[#FF4800] bg-[#FFF7F4] text-[#FF4800] ring-2 ring-[#FF4800]/15"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

// Mounted fresh each time it opens (see `key` at the call site), so state starts from `initial`.
function AreaFormModal({ initial, onClose, onSubmit, saving }) {
  const [name, setName] = useState(initial?.name || "Interior");
  const [kind, setKind] = useState(initial?.kind || "interior");
  const [nameTouched, setNameTouched] = useState(Boolean(initial?.name));

  const onKindChange = (next) => {
    setKind(next);
    // Suggest the type's name until the user types their own.
    if (!nameTouched) setName(kindMeta(next).label);
  };

  const submit = (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Give this area a name.");
    onSubmit({ name: trimmed.slice(0, 40), kind });
  };

  return (
    <Modal
      open
      title={initial?.id ? "Edit area" : "Add area"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} loading={saving}>
            {initial?.id ? "Save area" : "Add area"}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Type">
          <KindPicker value={kind} onChange={onKindChange} />
        </Field>
        <Field label="Name" hint="Shown to your staff on the floor map, e.g. “Rooftop Lounge” or “Garden Patio”.">
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            className={inputCls}
            placeholder={kindMeta(kind).label}
          />
        </Field>
      </form>
    </Modal>
  );
}

// Mounted only while open, so every "Add table" starts from the next free number.
function AddTableModal({ areas, defaultAreaId, nextTableNo, usedNumbers, onClose, onSubmit, saving }) {
  const [areaId, setAreaId] = useState(defaultAreaId || areas[0]?.id || "");
  const [tableNo, setTableNo] = useState(String(nextTableNo));
  const [label, setLabel] = useState(`T${nextTableNo}`);
  const [labelTouched, setLabelTouched] = useState(false);
  const [shape, setShape] = useState("square");
  const [capacity, setCapacity] = useState(4);

  const num = Number(tableNo);
  const numberError =
    !Number.isInteger(num) || num < 1 || num > 9999
      ? "Enter a number from 1 to 9999."
      : usedNumbers.has(num)
      ? `T${num} already exists.`
      : "";

  const submit = (e) => {
    e?.preventDefault();
    if (!areaId) return toast.error("Choose an area for this table.");
    if (numberError) return toast.error(numberError);
    onSubmit({
      area_id: areaId,
      table_no: num,
      label: (label.trim() || `T${num}`).slice(0, 40),
      shape,
      capacity,
    });
  };

  return (
    <Modal
      open
      title="Add a table"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} loading={saving} disabled={Boolean(numberError)}>
            <Plus className="h-4 w-4" /> Add table
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Area">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={inputCls}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {kindMeta(a.kind).label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Table number" hint="Used on the table's QR code. Can't be changed later.">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              value={tableNo}
              onChange={(e) => {
                setTableNo(e.target.value);
                if (!labelTouched) setLabel(e.target.value ? `T${e.target.value}` : "");
              }}
              className={`${inputCls} ${numberError ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200" : ""}`}
            />
            {numberError ? <span className="block text-[11px] font-medium text-rose-600">{numberError}</span> : null}
          </Field>
          <Field label="Label" hint="What staff see, e.g. “Window 2”.">
            <input
              value={label}
              maxLength={40}
              onChange={(e) => {
                setLabel(e.target.value);
                setLabelTouched(true);
              }}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Shape">
          <ShapePicker value={shape} capacity={capacity} onChange={setShape} />
        </Field>

        <Field label="Seats">
          <SeatPicker value={capacity} onChange={setCapacity} />
        </Field>

        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-[radial-gradient(circle,_#f3f4f6_1px,_transparent_1px)] py-8 [background-size:16px_16px]">
          <TableShape
            shape={shape}
            capacity={capacity}
            label={label.trim() || `T${tableNo || "?"}`}
            sublabel={`${capacity} seats`}
            scale={0.85}
            className="shadow-sm ring-2 ring-[#FF4800]"
          />
        </div>
      </form>
    </Modal>
  );
}

function ConfirmModal({ open, title, description, confirmText, onConfirm, onClose, loading }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{description}</p>
    </Modal>
  );
}

// Mounted per table (keyed by id), so the draft always starts from the selected table.
function TableEditor({ table, areas, saving, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState({
    label: table.label,
    shape: table.shape,
    capacity: table.capacity,
    area_id: table.area_id || "",
  });

  const dirty =
    draft.label !== table.label ||
    draft.shape !== table.shape ||
    draft.capacity !== table.capacity ||
    draft.area_id !== (table.area_id || "");

  const save = () =>
    onSave({
      label: draft.label.trim().slice(0, 40) || `T${table.table_no}`,
      shape: draft.shape,
      capacity: draft.capacity,
      area_id: draft.area_id || null,
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Edit table</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
            <Lock className="h-3 w-3" /> Table number T{table.table_no} (fixed for its QR code)
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
          aria-label="Close table editor"
        >
          <X className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      <Field label="Label">
        <input
          value={draft.label}
          maxLength={40}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          className={inputCls}
        />
      </Field>

      <Field label="Area">
        <select
          value={draft.area_id}
          onChange={(e) => setDraft((d) => ({ ...d, area_id: e.target.value }))}
          className={inputCls}
        >
          {!draft.area_id ? <option value="">Unassigned</option> : null}
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {kindMeta(a.kind).label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Shape">
        <ShapePicker value={draft.shape} capacity={draft.capacity} onChange={(shape) => setDraft((d) => ({ ...d, shape }))} />
      </Field>

      <Field label="Seats">
        <SeatPicker value={draft.capacity} onChange={(capacity) => setDraft((d) => ({ ...d, capacity }))} />
      </Field>

      <div className="flex gap-2 pt-1">
        <PrimaryButton onClick={save} loading={saving} disabled={!dirty} className="flex-1">
          Save changes
        </PrimaryButton>
        <SecondaryButton
          onClick={onDelete}
          className="px-3 text-rose-600 hover:bg-rose-50"
          aria-label="Delete table"
        >
          <Trash2 className="h-4 w-4" />
        </SecondaryButton>
      </div>
    </div>
  );
}

export default function RestaurantTableLayoutPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeAreaId, setActiveAreaId] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [areaModal, setAreaModal] = useState(null); // null | {} (add) | area (edit)
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: "table" | "area", item }
  const [busy, setBusy] = useState("");

  const [dragId, setDragId] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const canvasRef = useRef(null);
  const nudgeTimerRef = useRef(null);

  const sortedAreas = useMemo(() => sortAreas(areas), [areas]);

  const unassignedCount = useMemo(() => tables.filter((t) => !t.area_id).length, [tables]);

  const areaTabs = useMemo(() => {
    const tabs = sortedAreas.map((a) => ({ ...a, count: tables.filter((t) => t.area_id === a.id).length }));
    if (unassignedCount) tabs.push({ id: UNASSIGNED, name: "Unassigned", kind: "other", count: unassignedCount });
    return tabs;
  }, [sortedAreas, tables, unassignedCount]);

  const activeArea = areaTabs.find((a) => a.id === activeAreaId) || null;

  const areaTables = useMemo(
    () =>
      tables
        .filter((t) => (activeAreaId === UNASSIGNED ? !t.area_id : t.area_id === activeAreaId))
        .sort((a, b) => a.table_no - b.table_no),
    [tables, activeAreaId]
  );

  const selected = useMemo(() => tables.find((t) => t.id === selectedId) || null, [tables, selectedId]);
  const usedNumbers = useMemo(() => new Set(tables.map((t) => t.table_no)), [tables]);
  const nextTableNo = useMemo(() => {
    let n = 1;
    while (usedNumbers.has(n)) n += 1;
    return n;
  }, [usedNumbers]);

  const totals = useMemo(
    () => ({
      tables: areaTables.length,
      seats: areaTables.reduce((sum, t) => sum + Number(t.capacity || 0), 0),
    }),
    [areaTables]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const rid = await getActiveRestaurantId();
      if (!rid) throw new Error("Restaurant not found for this account.");
      setRestaurantId(rid);

      const [areasRes, tablesRes] = await Promise.all([
        supabaseBrowser
          .from("restaurant_table_areas")
          .select("id, name, kind, sort_order, created_at")
          .eq("restaurant_id", rid)
          .order("sort_order", { ascending: true }),
        supabaseBrowser
          .from("restaurant_table_layouts")
          .select("id, table_no, label, shape, capacity, pos_x, pos_y, area_id")
          .eq("restaurant_id", rid)
          .order("table_no", { ascending: true }),
      ]);
      if (areasRes.error) throw areasRes.error;
      if (tablesRes.error) throw tablesRes.error;

      const nextAreas = areasRes.data || [];
      const nextTables = (tablesRes.data || []).map((row) => ({
        ...row,
        label: row.label || `T${row.table_no}`,
        shape: SHAPES.some((s) => s.value === row.shape) ? row.shape : "square",
        capacity: CAPACITIES.includes(row.capacity) ? row.capacity : 4,
        pos_x: Number(row.pos_x) || 10,
        pos_y: Number(row.pos_y) || 10,
      }));
      setAreas(nextAreas);
      setTables(nextTables);
      setActiveAreaId((prev) => {
        if (prev === UNASSIGNED && nextTables.some((t) => !t.area_id)) return prev;
        if (nextAreas.some((a) => a.id === prev)) return prev;
        return nextAreas[0]?.id || (nextTables.some((t) => !t.area_id) ? UNASSIGNED : "");
      });
    } catch (e) {
      const msg = friendlyError(e, "Failed to load table layout.");
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tables keep their design size on a 960px-wide map and scale with the canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setCanvasScale(clamp(entry.contentRect.width / BASE_CANVAS_W, 0.6, 1.3));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, activeAreaId]);

  const patchLocal = (id, patch) => setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const persistTable = async (id, patch, { silent = false } = {}) => {
    const { error } = await supabaseBrowser
      .from("restaurant_table_layouts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    if (error) {
      toast.error(friendlyError(error, "Couldn't save the table."));
      await load();
      return false;
    }
    if (!silent) toast.success("Table saved.");
    return true;
  };

  // ---------- Areas ----------
  const saveArea = async ({ name, kind }) => {
    if (!restaurantId) return;
    setBusy("area");
    try {
      if (areaModal?.id) {
        const { error } = await supabaseBrowser
          .from("restaurant_table_areas")
          .update({ name, kind })
          .eq("id", areaModal.id)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
        setAreas((prev) => prev.map((a) => (a.id === areaModal.id ? { ...a, name, kind } : a)));
        toast.success("Area updated.");
      } else {
        const sort_order = areas.reduce((m, a) => Math.max(m, a.sort_order), -1) + 1;
        const { data, error } = await supabaseBrowser
          .from("restaurant_table_areas")
          .insert({ restaurant_id: restaurantId, name, kind, sort_order })
          .select("id, name, kind, sort_order, created_at")
          .single();
        if (error) throw error;
        setAreas((prev) => [...prev, data]);
        setActiveAreaId(data.id);
        setSelectedId(null);
        toast.success(`${name} added.`);
      }
      setAreaModal(null);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't save the area."));
    } finally {
      setBusy("");
    }
  };

  const deleteArea = async (area) => {
    setBusy("delete");
    try {
      const { error } = await supabaseBrowser
        .from("restaurant_table_areas")
        .delete()
        .eq("id", area.id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      const remaining = sortedAreas.filter((a) => a.id !== area.id);
      setAreas(remaining);
      setActiveAreaId(remaining[0]?.id || (unassignedCount ? UNASSIGNED : ""));
      toast.success(`${area.name} deleted.`);
      setConfirm(null);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't delete the area."));
    } finally {
      setBusy("");
    }
  };

  // ---------- Tables ----------
  const addTable = async (values) => {
    if (!restaurantId) return;
    setBusy("table");
    try {
      const spot = findFreeSpot(tables.filter((t) => t.area_id === values.area_id));
      const { data, error } = await supabaseBrowser
        .from("restaurant_table_layouts")
        .insert({ restaurant_id: restaurantId, ...values, pos_x: spot.x, pos_y: spot.y })
        .select("id, table_no, label, shape, capacity, pos_x, pos_y, area_id")
        .single();
      if (error) throw error;
      const row = { ...data, pos_x: Number(data.pos_x), pos_y: Number(data.pos_y) };
      setTables((prev) => [...prev, row]);
      setActiveAreaId(row.area_id);
      setSelectedId(row.id);
      setAddTableOpen(false);
      toast.success(`${row.label} added. Drag it into place.`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't add the table."));
    } finally {
      setBusy("");
    }
  };

  const saveTable = async (patch) => {
    if (!selected) return;
    setBusy("save");
    patchLocal(selected.id, patch);
    const ok = await persistTable(selected.id, patch);
    setBusy("");
    if (ok && patch.area_id && patch.area_id !== activeAreaId) setActiveAreaId(patch.area_id);
  };

  const deleteTable = async (table) => {
    setBusy("delete");
    const { error } = await supabaseBrowser
      .from("restaurant_table_layouts")
      .delete()
      .eq("id", table.id)
      .eq("restaurant_id", restaurantId);
    setBusy("");
    if (error) return toast.error(friendlyError(error, "Couldn't delete the table."));
    setTables((prev) => prev.filter((t) => t.id !== table.id));
    if (selectedId === table.id) setSelectedId(null);
    setConfirm(null);
    toast.success(`${table.label} deleted.`);
  };

  // ---------- Dragging (mouse, pen and touch) ----------
  const onPointerDown = (e, table) => {
    if (e.button !== undefined && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: table.pos_x, y: table.pos_y };
    let latest = origin;
    let moved = false;

    setSelectedId(table.id);

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) setDragId(table.id);
      moved = true;
      latest = {
        x: round1(clamp(origin.x + (dx / rect.width) * 100, 3, 97)),
        y: round1(clamp(origin.y + (dy / rect.height) * 100, 4, 96)),
      };
      patchLocal(table.id, { pos_x: latest.x, pos_y: latest.y });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragId(null);
      if (moved) persistTable(table.id, { pos_x: latest.x, pos_y: latest.y }, { silent: true });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Arrow keys nudge the selected table (Shift = bigger steps); saved after a short pause.
  const onCanvasKeyDown = (e) => {
    if (!selected) return;
    const step = e.shiftKey ? 5 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) {
      if (e.key === "Escape") setSelectedId(null);
      return;
    }
    e.preventDefault();
    const next = {
      pos_x: round1(clamp(selected.pos_x + delta[0], 3, 97)),
      pos_y: round1(clamp(selected.pos_y + delta[1], 4, 96)),
    };
    patchLocal(selected.id, next);
    clearTimeout(nudgeTimerRef.current);
    const id = selected.id;
    nudgeTimerRef.current = setTimeout(() => persistTable(id, next, { silent: true }), 500);
  };

  useEffect(() => () => clearTimeout(nudgeTimerRef.current), []);

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 rounded-2xl bg-gray-100" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 w-32 rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="aspect-[16/10] rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const header = (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#FFE2D6] bg-[#FFF7F4] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF4800] shadow-sm">
          <Table2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">Table Layout</h1>
          <p className="text-sm text-gray-700">Set up your floors and areas, then add tables one at a time.</p>
        </div>
      </div>
      {areas.length ? (
        <PrimaryButton onClick={() => setAddTableOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Add table
        </PrimaryButton>
      ) : null}
    </div>
  );

  const modals = (
    <>
      {areaModal ? (
        <AreaFormModal
          key={areaModal.id || "new"}
          initial={areaModal}
          saving={busy === "area"}
          onClose={() => setAreaModal(null)}
          onSubmit={saveArea}
        />
      ) : null}
      {addTableOpen ? (
        <AddTableModal
        areas={sortedAreas}
        defaultAreaId={activeAreaId !== UNASSIGNED ? activeAreaId : sortedAreas[0]?.id}
        nextTableNo={nextTableNo}
        usedNumbers={usedNumbers}
        saving={busy === "table"}
        onClose={() => setAddTableOpen(false)}
        onSubmit={addTable}
        />
      ) : null}
      <ConfirmModal
        open={Boolean(confirm)}
        loading={busy === "delete"}
        title={confirm?.type === "area" ? `Delete ${confirm?.item?.name}?` : `Delete ${confirm?.item?.label}?`}
        description={
          confirm?.type === "area"
            ? "This area has no tables. It will be removed from your floor plan."
            : "This table will be removed from the floor plan and its QR code will stop working. Past orders are kept."
        }
        confirmText={confirm?.type === "area" ? "Delete area" : "Delete table"}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm?.type === "area" ? deleteArea(confirm.item) : deleteTable(confirm.item))}
      />
    </>
  );

  if (loadError && !areas.length && !tables.length) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {loadError}
          <div className="mt-3">
            <SecondaryButton onClick={load}>Try again</SecondaryButton>
          </div>
        </div>
      </div>
    );
  }

  if (!areas.length && !tables.length) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7F4] text-[#FF4800]">
            <MapPin className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Start with your first area</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
            Areas are the parts of your restaurant where guests sit. Each one gets its own floor map.
          </p>
          <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            {AREA_KINDS.slice(0, 4).map((k) => {
              const Icon = k.icon;
              return (
                <button
                  key={k.value}
                  type="button"
                  disabled={busy === "area"}
                  onClick={() => saveArea({ name: k.label, kind: k.value })}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-4 text-sm font-semibold text-gray-800 transition hover:border-[#FF4800] hover:bg-[#FFF7F4] hover:text-[#FF4800] disabled:opacity-60"
                >
                  <Icon className="h-6 w-6" />
                  {k.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setAreaModal({})}
            className="mt-4 text-sm font-semibold text-[#FF4800] hover:underline"
          >
            Or create a custom area
          </button>
        </div>
        {modals}
      </div>
    );
  }

  const ActiveIcon = kindMeta(activeArea?.kind).icon;

  return (
    <div className="space-y-5">
      {header}

      {/* Area tabs */}
      <div className="flex items-center gap-2">
        <div className="no-scrollbar -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Areas">
          {areaTabs.map((a) => {
            const Icon = kindMeta(a.kind).icon;
            const active = a.id === activeAreaId;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveAreaId(a.id);
                  setSelectedId(null);
                }}
                className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold transition ${
                  active
                    ? "border-transparent text-white shadow-[0_10px_18px_rgba(255,72,0,0.18)]"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-[#FFF7F4] hover:text-[#FF4800]"
                }`}
                style={active ? { background: GRADIENT } : undefined}
              >
                <Icon className="h-4 w-4" />
                {a.name}
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] ${
                    active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {a.count}
                </span>
              </button>
            );
          })}
        </div>
        <SecondaryButton onClick={() => setAreaModal({})} className="shrink-0 px-3" aria-label="Add area">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add area</span>
        </SecondaryButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Floor map */}
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF7F4] text-[#FF4800]">
                <ActiveIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">{activeArea?.name || "Area"}</div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Table2 className="h-3.5 w-3.5" /> {totals.tables} {totals.tables === 1 ? "table" : "tables"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {totals.seats} seats
                  </span>
                </div>
              </div>
            </div>
            {activeArea && activeArea.id !== UNASSIGNED ? (
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={() => setAreaModal(activeArea)} className="h-9 px-3 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> Edit area
                </SecondaryButton>
                <SecondaryButton
                  onClick={() => setConfirm({ type: "area", item: activeArea })}
                  disabled={activeArea.count > 0}
                  title={activeArea.count > 0 ? "Move or delete this area's tables first" : "Delete area"}
                  className="h-9 px-3 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </SecondaryButton>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl">
            <div
              ref={canvasRef}
              tabIndex={0}
              onKeyDown={onCanvasKeyDown}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
              aria-label={`${activeArea?.name || "Area"} floor map. Select a table, then drag it or use the arrow keys to move it.`}
              className="relative aspect-[16/10] w-full min-w-[640px] select-none overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-[#FCFCFD] bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] outline-none [background-size:20px_20px] focus-visible:ring-2 focus-visible:ring-[#FF4800]/30"
            >
              {areaTables.map((t) => {
                const isSelected = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onPointerDown={(e) => onPointerDown(e, t)}
                    onClick={() => setSelectedId(t.id)}
                    aria-pressed={isSelected}
                    aria-label={`${t.label}, ${t.capacity} seats`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 touch-none"
                    style={{
                      left: `${t.pos_x}%`,
                      top: `${t.pos_y}%`,
                      cursor: dragId === t.id ? "grabbing" : "grab",
                      zIndex: isSelected || dragId === t.id ? 10 : 1,
                    }}
                  >
                    <TableShape
                      shape={t.shape}
                      capacity={t.capacity}
                      label={t.label}
                      sublabel={`${t.capacity} seats`}
                      scale={canvasScale}
                      className={`transition-shadow ${
                        isSelected
                          ? "ring-2 ring-[#FF4800] shadow-[0_12px_28px_rgba(255,72,0,0.22)]"
                          : "ring-1 ring-gray-200 shadow-sm hover:ring-gray-300"
                      } ${dragId === t.id ? "scale-[1.03]" : ""}`}
                    />
                  </button>
                );
              })}

              {areaTables.length === 0 ? (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">No tables in {activeArea?.name || "this area"} yet</div>
                    <div className="mt-1 text-xs text-gray-500">Add your first table, then drag it into place.</div>
                    {activeAreaId !== UNASSIGNED ? (
                      <PrimaryButton onClick={() => setAddTableOpen(true)} className="mt-4">
                        <Plus className="h-4 w-4" /> Add table
                      </PrimaryButton>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Move className="h-3.5 w-3.5 shrink-0" />
            Drag tables to position them. Positions save automatically. Arrow keys nudge the selected table.
          </div>
        </div>

        {/* Selected table panel */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 xl:sticky xl:top-20 xl:self-start">
          {!selected ? (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
                <Armchair className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-gray-900">No table selected</div>
              <div className="mt-1 text-xs text-gray-500">Tap a table on the map to edit it.</div>
              {areaTables.length ? (
                <div className="mt-5 max-h-64 space-y-1.5 overflow-y-auto text-left">
                  {areaTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="font-semibold text-gray-800">{t.label}</span>
                      <span className="text-xs text-gray-500">
                        T{t.table_no} · {t.capacity} seats
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <TableEditor
              key={selected.id}
              table={selected}
              areas={sortedAreas}
              saving={busy === "save"}
              onSave={saveTable}
              onDelete={() => setConfirm({ type: "table", item: selected })}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      {modals}
    </div>
  );
}
