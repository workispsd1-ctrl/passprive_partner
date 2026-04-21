"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  createStoreService,
  deleteStoreService,
  getStoreServices,
  updateStoreService,
} from "@/lib/store-partner/servicesApi";

const SERVICE_BUCKET = "store-services";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function getExt(file) {
  const byName = file?.name?.split(".").pop()?.toLowerCase();
  if (byName) return byName;
  const byType = file?.type?.split("/")[1]?.toLowerCase();
  return byType || "bin";
}

function normalizeStoreType(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "service" ? "SERVICE" : "PRODUCT";
}

function asNum(v, fallback = null) {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asText(v) {
  const t = String(v || "").trim();
  return t || null;
}

function pickServicePayload(raw = {}) {
  return {
    title: String(raw.title || "").trim(),
    description: asText(raw.description),
    image_url: raw.image_url || null,
    image_path: raw.image_path || null,
    base_price: Math.max(0, Number(raw.base_price || 0)),
    currency_code: String(raw.currency_code || "MUR").trim().toUpperCase() || "MUR",
    duration_minutes: asNum(raw.duration_minutes),
    category: asText(raw.category),
    service_type: asText(raw.service_type),
    sort_order: asNum(raw.sort_order, 100),
    is_active: raw.is_active !== false,
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

function parseServicesResponse(resp) {
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.services)) return resp.services;
  return [];
}

function parseSingleResponse(resp) {
  if (!resp) return null;
  if (resp?.data && !Array.isArray(resp.data)) return resp.data;
  if (resp?.service && !Array.isArray(resp.service)) return resp.service;
  if (resp?.id) return resp;
  return null;
}

function emptyForm() {
  return {
    title: "",
    description: "",
    base_price: "",
    currency_code: "MUR",
    duration_minutes: "",
    category: "",
    service_type: "",
    sort_order: "100",
    is_active: true,
    metadata_text: "{}",
    image_file: null,
    image_url: "",
    image_path: "",
  };
}

function Badge({ value }) {
  const on = value !== false;
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
        on
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      {on ? "Active" : "Inactive"}
    </span>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-gray-500">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function StoreServicesManager({ storeId, storeType }) {
  const isServiceStore = normalizeStoreType(storeType) === "SERVICE";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [services, setServices] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm());

  const canSubmit = useMemo(() => {
    const title = String(form.title || "").trim();
    const price = Number(form.base_price);
    return title.length > 0 && Number.isFinite(price) && price >= 0;
  }, [form]);

  const loadServices = async () => {
    if (!storeId || !isServiceStore) return;
    try {
      setLoading(true);
      setError("");
      const resp = await getStoreServices(storeId);
      const rows = parseServicesResponse(resp);
      setServices(rows);
    } catch (e) {
      setError(e?.message || "Failed to load services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setServices([]);
    setEditingId("");
    setForm(emptyForm());
    setError("");
    setSuccess("");
    if (isServiceStore && storeId) loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isServiceStore]);

  if (!isServiceStore) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm());
    setShowAdvanced(false);
  };

  const startEdit = (service) => {
    setEditingId(String(service.id));
    setForm({
      title: service.title || "",
      description: service.description || "",
      base_price: service.base_price === null || service.base_price === undefined ? "" : String(service.base_price),
      currency_code: service.currency_code || "MUR",
      duration_minutes:
        service.duration_minutes === null || service.duration_minutes === undefined
          ? ""
          : String(service.duration_minutes),
      category: service.category || "",
      service_type: service.service_type || "",
      sort_order: service.sort_order === null || service.sort_order === undefined ? "100" : String(service.sort_order),
      is_active: service.is_active !== false,
      metadata_text:
        service.metadata && typeof service.metadata === "object"
          ? JSON.stringify(service.metadata, null, 2)
          : "{}",
      image_file: null,
      image_url: service.image_url || "",
      image_path: service.image_path || "",
    });
  };

  const uploadImage = async (serviceTargetId, file) => {
    const ext = getExt(file);
    const path = `${storeId}/${serviceTargetId}/${uid()}.${ext}`;

    const { error: uploadError } = await supabaseBrowser.storage
      .from(SERVICE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file?.type || undefined });

    if (uploadError) throw uploadError;

    const { data } = supabaseBrowser.storage.from(SERVICE_BUCKET).getPublicUrl(path);
    return { image_url: data?.publicUrl || "", image_path: path };
  };

  const buildPayload = () => {
    let metadata = {};
    const rawMetadata = String(form.metadata_text || "").trim();
    if (rawMetadata) {
      try {
        const parsed = JSON.parse(rawMetadata);
        if (parsed && typeof parsed === "object") metadata = parsed;
      } catch {
        throw new Error("Metadata must be valid JSON.");
      }
    }

    return pickServicePayload({
      title: form.title,
      description: form.description,
      image_url: form.image_url || null,
      image_path: form.image_path || null,
      base_price: form.base_price,
      currency_code: form.currency_code,
      duration_minutes: form.duration_minutes,
      category: form.category,
      service_type: form.service_type,
      sort_order: form.sort_order,
      is_active: form.is_active,
      metadata,
    });
  };

  const submitForm = async () => {
    if (!canSubmit || saving || !storeId) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const basePayload = buildPayload();

      if (editingId) {
        let payload = { ...basePayload };

        if (form.image_file) {
          const image = await uploadImage(editingId, form.image_file);
          payload = { ...payload, ...image };
        }

        await updateStoreService(storeId, editingId, payload);
        setSuccess("Service updated.");
      } else {
        let createPayload = { ...basePayload };
        if (form.image_file) {
          // If the API does not return created id, we still persist an image using a temp path.
          const tempImage = await uploadImage(`tmp-${uid()}`, form.image_file);
          createPayload = { ...createPayload, ...tempImage };
        }

        const createdResp = await createStoreService(storeId, createPayload);
        const created = parseSingleResponse(createdResp);

        if (form.image_file && created?.id) {
          const image = await uploadImage(created.id, form.image_file);
          await updateStoreService(storeId, created.id, { ...createPayload, ...image });
        }

        setSuccess("Service added.");
      }

      resetForm();
      await loadServices();
    } catch (e) {
      setError(e?.message || "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const removeService = async (service) => {
    const ok = window.confirm(`Delete service \"${service?.title || "Untitled"}\"?`);
    if (!ok) return;

    try {
      setBusyId(String(service.id));
      setError("");
      setSuccess("");
      await deleteStoreService(storeId, service.id);
      if (String(editingId) === String(service.id)) resetForm();
      setSuccess("Service deleted.");
      await loadServices();
    } catch (e) {
      setError(e?.message || "Failed to delete service.");
    } finally {
      setBusyId("");
    }
  };

  const toggleActive = async (service) => {
    try {
      setBusyId(String(service.id));
      setError("");
      setSuccess("");
      const payload = pickServicePayload({ ...service, is_active: service.is_active === false });
      await updateStoreService(storeId, service.id, payload);
      setSuccess("Service status updated.");
      await loadServices();
    } catch (e) {
      setError(e?.message || "Failed to update service.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold text-gray-900">Services</div>
          <div className="mt-1 text-xs text-gray-500">Manage service offerings for this service store.</div>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 self-start rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)]"
          style={{
            background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
          }}
          onClick={resetForm}
        >
          <Plus className="h-4 w-4" />
          Add Service
        </button>
      </div>

      <div className="space-y-4 p-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 text-sm font-semibold text-gray-900">{editingId ? "Edit Service" : "Add Service"}</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Title *">
              <input
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Hair Cut"
              />
            </Field>

            <Field label="Base Price *">
              <input
                type="number"
                min="0"
                step="0.01"
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.base_price}
                onChange={(e) => setField("base_price", e.target.value)}
                placeholder="250"
              />
            </Field>

            <Field label="Currency Code">
              <input
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm uppercase outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.currency_code}
                onChange={(e) => setField("currency_code", e.target.value.toUpperCase())}
                placeholder="MUR"
                maxLength={3}
              />
            </Field>

            <Field label="Duration (minutes)">
              <input
                type="number"
                min="0"
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.duration_minutes}
                onChange={(e) => setField("duration_minutes", e.target.value)}
                placeholder="30"
              />
            </Field>

            <Field label="Category">
              <input
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="Hair"
              />
            </Field>

            <Field label="Service Type">
              <input
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.service_type}
                onChange={(e) => setField("service_type", e.target.value)}
                placeholder="Men"
              />
            </Field>

            <Field label="Sort Order">
              <input
                type="number"
                className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.sort_order}
                onChange={(e) => setField("sort_order", e.target.value)}
                placeholder="100"
              />
            </Field>

            <Field label="Image" hint="Uploads to store-services bucket">
              <input
                type="file"
                accept="image/*"
                className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                onChange={(e) => setField("image_file", e.target.files?.[0] || null)}
              />
              {form.image_url ? (
                <div className="mt-2 text-xs text-gray-500">Current image: {form.image_url}</div>
              ) : null}
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <textarea
                className="min-h-[90px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Classic haircut with wash"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              Active
            </label>

            <button
              type="button"
              className="text-xs font-semibold text-gray-600 underline underline-offset-2"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced" : "Show advanced metadata"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="mt-4">
              <Field label="Metadata (JSON)">
                <textarea
                  className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-mono text-xs outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]"
                  value={form.metadata_text}
                  onChange={(e) => setField("metadata_text", e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {editingId ? (
              <button
                type="button"
                className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-100"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            ) : null}

            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-60"
              style={{
                background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)",
              }}
              disabled={!canSubmit || saving}
              onClick={submitForm}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save Service" : "Add Service"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Image</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Sort</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading services...
                    </span>
                  </td>
                </tr>
              ) : services.length ? (
                services.map((service) => {
                  const isBusy = busyId === String(service.id);
                  return (
                    <tr key={service.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3">
                        <div className="h-14 w-14 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                          {service.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={service.image_url} alt={service.title || "Service"} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{service.title || "Untitled"}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {Number(service.base_price || 0).toLocaleString()} {service.currency_code || "MUR"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{service.duration_minutes ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{service.category || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{service.service_type || "-"}</td>
                      <td className="px-4 py-3"><Badge value={service.is_active} /></td>
                      <td className="px-4 py-3 text-gray-700">{service.sort_order ?? 100}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            onClick={() => startEdit(service)}
                            disabled={isBusy}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            onClick={() => toggleActive(service)}
                            disabled={isBusy}
                          >
                            {isBusy ? "Working..." : service.is_active !== false ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100"
                            onClick={() => removeService(service)}
                            disabled={isBusy}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    No services yet. Add your first service.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
