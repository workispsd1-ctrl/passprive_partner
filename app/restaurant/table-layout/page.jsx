"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Plus, Trash2, Table2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

const SHAPES = ["circle", "square", "rectangle"];
const CAPACITIES = [2, 4, 6, 8, 10, 12];
const CANVAS_W = 960;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
    for (let i = 0; i < top; i += 1) {
      points.push({ x: ((i + 1) / (top + 1)) * 100, y: -10 });
    }
    for (let i = 0; i < bottom; i += 1) {
      points.push({ x: ((i + 1) / (bottom + 1)) * 100, y: 110 });
    }
    return points;
  }

  return Array.from({ length: n }).map((_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 62;
    const x = 50 + Math.cos(angle) * r;
    const y = 50 + Math.sin(angle) * r;
    return { x, y };
  });
}

function toRow(restaurantId, table) {
  return {
    id: table.id,
    restaurant_id: restaurantId,
    table_no: table.table_no,
    label: table.label,
    shape: table.shape,
    capacity: table.capacity,
    pos_x: table.pos_x,
    pos_y: table.pos_y,
  };
}

export default function RestaurantTableLayoutPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tables, setTables] = useState([]);
  const [targetCount, setTargetCount] = useState(4);
  const [defaultShape, setDefaultShape] = useState("square");
  const [defaultCapacity, setDefaultCapacity] = useState(4);

  const [selectedId, setSelectedId] = useState(null);
  const [dragId, setDragId] = useState(null);

  const canvasRef = useRef(null);

  const selected = useMemo(() => tables.find((t) => t.id === selectedId) || null, [tables, selectedId]);

  const resolveRestaurantId = async () => {
    const {
      data: { user },
      error,
    } = await supabaseBrowser.auth.getUser();
    if (error || !user) throw new Error("Please sign in again.");

    const ownerRes = await supabaseBrowser
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!ownerRes.error && ownerRes.data?.id) return ownerRes.data.id;

    const staffRes = await supabaseBrowser
      .from("restaurant_staff")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!staffRes.error && staffRes.data?.restaurant_id) return staffRes.data.restaurant_id;

    throw new Error("Restaurant not found for this account.");
  };

  const load = async () => {
    try {
      setLoading(true);
      const rid = await resolveRestaurantId();
      setRestaurantId(rid);

      const { data, error } = await supabaseBrowser
        .from("restaurant_table_layouts")
        .select("id, table_no, label, shape, capacity, pos_x, pos_y")
        .eq("restaurant_id", rid)
        .order("table_no", { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map((row) => ({
        id: row.id,
        table_no: row.table_no,
        label: row.label || `T${row.table_no}`,
        shape: SHAPES.includes(row.shape) ? row.shape : "square",
        capacity: CAPACITIES.includes(row.capacity) ? row.capacity : 4,
        pos_x: Number(row.pos_x) || 10,
        pos_y: Number(row.pos_y) || 10,
      }));

      setTables(mapped);
      setTargetCount(mapped.length || 4);
      setSelectedId(mapped[0]?.id || null);
    } catch (e) {
      toast.error(e?.message || "Failed to load table layout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const regenerateByCount = () => {
    const count = clamp(Number(targetCount) || 1, 1, 200);
    const cols = Math.max(1, Math.floor(CANVAS_W / 160));

    const next = [];
    for (let i = 0; i < count; i += 1) {
      const existing = tables[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 8 + col * 14;
      const y = 8 + row * 14;

      next.push({
        id: existing?.id || crypto.randomUUID(),
        table_no: i + 1,
        label: existing?.label || `T${i + 1}`,
        shape: existing?.shape || defaultShape,
        capacity: existing?.capacity || Number(defaultCapacity),
        pos_x: clamp(existing?.pos_x ?? x, 2, 96),
        pos_y: clamp(existing?.pos_y ?? y, 2, 96),
      });
    }

    setTables(next);
    setSelectedId((prev) => (next.some((t) => t.id === prev) ? prev : next[0]?.id || null));
  };

  useEffect(() => {
    if (loading) return;
    const safeCount = clamp(Number(targetCount) || 1, 1, 200);
    if (tables.length !== safeCount) regenerateByCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCount]);

  const addOneTable = () => {
    if (tables.length >= targetCount) {
      toast.error(`Only ${targetCount} table(s) allowed. Increase count to add more.`);
      return;
    }
    const n = tables.length + 1;
    const table = {
      id: crypto.randomUUID(),
      table_no: n,
      label: `T${n}`,
      shape: defaultShape,
      capacity: Number(defaultCapacity),
      pos_x: 10,
      pos_y: 10,
    };
    setTables((prev) => [...prev, table]);
    setSelectedId(table.id);
  };

  const removeTable = (id) => {
    const filtered = tables.filter((t) => t.id !== id).map((t, idx) => ({ ...t, table_no: idx + 1 }));
    setTables(filtered);
    if (selectedId === id) setSelectedId(filtered[0]?.id || null);
  };

  const updateSelected = (patch) => {
    if (!selectedId) return;
    setTables((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
  };

  const saveAll = async () => {
    if (!restaurantId) return;
    try {
      setSaving(true);
      const cappedTables = tables.slice(0, clamp(Number(targetCount) || 1, 1, 200));

      const ids = cappedTables.map((t) => t.id);
      if (ids.length > 0) {
        const { error: delMissingErr } = await supabaseBrowser
          .from("restaurant_table_layouts")
          .delete()
          .eq("restaurant_id", restaurantId)
          .not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
        if (delMissingErr) throw delMissingErr;
      } else {
        const { error: clearErr } = await supabaseBrowser
          .from("restaurant_table_layouts")
          .delete()
          .eq("restaurant_id", restaurantId);
        if (clearErr) throw clearErr;
      }

      if (cappedTables.length > 0) {
        const rows = cappedTables.map((t, idx) =>
          toRow(restaurantId, {
            ...t,
            table_no: idx + 1,
            label: (t.label || `T${idx + 1}`).trim() || `T${idx + 1}`,
            pos_x: clamp(Number(t.pos_x) || 10, 0, 100),
            pos_y: clamp(Number(t.pos_y) || 10, 0, 100),
          })
        );

        const { error: upsertErr } = await supabaseBrowser
          .from("restaurant_table_layouts")
          .upsert(rows, { onConflict: "id" });
        if (upsertErr) throw upsertErr;
      }

      if (cappedTables.length !== tables.length) {
        setTables(cappedTables.map((t, idx) => ({ ...t, table_no: idx + 1 })));
      }
      toast.success("Table layout saved.");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to save table layout.");
    } finally {
      setSaving(false);
    }
  };

  const onMouseDownTable = (e, tableId) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const current = tables.find((t) => t.id === tableId);
    if (!current) return;

    setDragId(tableId);
    setSelectedId(tableId);

    const startPxX = (Number(current.pos_x) / 100) * rect.width;
    const startPxY = (Number(current.pos_y) / 100) * rect.height;

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      const nextPxX = clamp(startPxX + dx, 0, rect.width);
      const nextPxY = clamp(startPxY + dy, 0, rect.height);

      const nextX = clamp((nextPxX / rect.width) * 100, 0, 100);
      const nextY = clamp((nextPxY / rect.height) * 100, 0, 100);

      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, pos_x: nextX, pos_y: nextY } : t)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragId(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="mt-3 h-4 w-80 rounded bg-gray-100" />
        <div className="mt-5 h-[420px] rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[rgba(119,31,168,.18)] bg-[#F4E7D1] p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/80 text-[#771FA8] flex items-center justify-center">
            <Table2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Table Layout</h1>
            <p className="text-sm text-gray-700">Set table shape, seating, and exact position on your floor map.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 grid gap-3 lg:grid-cols-12">
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-semibold text-gray-600">Number of tables</span>
              <input
                type="number"
                min={1}
                max={200}
                value={targetCount}
                onChange={(e) => setTargetCount(clamp(Number(e.target.value) || 1, 1, 200))}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              />
            </label>

            <label className="space-y-1 lg:col-span-3">
              <span className="text-xs font-semibold text-gray-600">Default shape</span>
              <select
                value={defaultShape}
                onChange={(e) => setDefaultShape(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              >
                {SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-semibold text-gray-600">Default capacity</span>
              <select
                value={defaultCapacity}
                onChange={(e) => setDefaultCapacity(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              >
                {CAPACITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <div className="lg:col-span-5 flex flex-wrap items-end justify-end gap-2">
              <button
                type="button"
                onClick={addOneTable}
                disabled={tables.length >= targetCount}
                className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add Table
              </button>

              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Layout
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="relative w-full overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-[radial-gradient(circle,_#f3f4f6_1px,_transparent_1px)]"
            style={{ minHeight: 620, backgroundSize: "18px 18px" }}
          >
            {tables.map((t) => {
              const size = sizeForShape(t.shape);
              const selectedCls = selectedId === t.id ? "ring-2 ring-[#771FA8]" : "ring-1 ring-gray-200";
              const chairs = chairPositions(t.shape, t.capacity);
              return (
                <button
                  key={t.id}
                  type="button"
                  onMouseDown={(e) => onMouseDownTable(e, t.id)}
                  onClick={() => setSelectedId(t.id)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 bg-white text-gray-900 shadow-sm ${selectedCls}`}
                  style={{
                    left: `${t.pos_x}%`,
                    top: `${t.pos_y}%`,
                    width: size.w,
                    height: size.h,
                    borderRadius: t.shape === "circle" ? 999 : 14,
                    cursor: dragId === t.id ? "grabbing" : "grab",
                  }}
                >
                  {chairs.map((c, idx) => (
                    <span
                      key={`${t.id}-chair-${idx}`}
                      className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-300 bg-[#F4E7D1]"
                      style={{ left: `${c.x}%`, top: `${c.y}%` }}
                    />
                  ))}
                  <div className="text-xs font-bold">{t.label}</div>
                  <div className="text-[11px] text-gray-600">{t.capacity} seats</div>
                </button>
              );
            })}

            {tables.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">
                No tables yet. Set a table count to generate your layout.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">Edit Selected Table</div>

          {!selected ? (
            <div className="mt-3 text-sm text-gray-500">Select a table from the layout to edit details.</div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-600">Label</span>
                <input
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-600">Shape</span>
                <select
                  value={selected.shape}
                  onChange={(e) => updateSelected({ shape: e.target.value })}
                  className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                >
                  {SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-600">Seating capacity</span>
                <select
                  value={selected.capacity}
                  onChange={(e) => updateSelected({ capacity: Number(e.target.value) })}
                  className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                >
                  {CAPACITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-gray-600">X (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(Number(selected.pos_x) || 0)}
                    onChange={(e) => updateSelected({ pos_x: clamp(Number(e.target.value) || 0, 0, 100) })}
                    className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-gray-600">Y (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(Number(selected.pos_y) || 0)}
                    onChange={(e) => updateSelected({ pos_y: clamp(Number(e.target.value) || 0, 0, 100) })}
                    className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => removeTable(selected.id)}
                className="h-9 w-full rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Delete Table
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
