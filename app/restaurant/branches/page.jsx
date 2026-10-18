"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getSavedRestaurantId, selectRestaurant } from "@/lib/restaurant-partner/activeRestaurant";

const EMPTY_FORM = {
  name: "",
  area: "",
  city: "",
  full_address: "",
  phone: "",
  admin_full_name: "",
  admin_email: "",
  admin_password: "",
};

async function authHeader() {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  return { Authorization: `Bearer ${token}` };
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-[rgba(119,31,168,0.14)]";

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const activeId = getSavedRestaurantId();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/restaurant/branches", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load branches.");
      setBranches(json.branches || []);
    } catch (e) {
      setError(e?.message || "Failed to load branches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/restaurant/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to add branch.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err?.message || "Failed to add branch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-600">
            As the master account you can manage every branch. Each branch partner sees and manages only their own branch.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#771FA8] px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add branch
        </button>
      </div>

      {showForm ? (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-900">New branch</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Branch name *">
              <input className={inputClass} value={form.name} onChange={set("name")} placeholder="e.g. Mo Burgers Grand Baie" />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={form.phone} onChange={set("phone")} placeholder="+230 5xxx xxxx" />
            </Field>
            <Field label="Area">
              <input className={inputClass} value={form.area} onChange={set("area")} placeholder="Grand Baie" />
            </Field>
            <Field label="City">
              <input className={inputClass} value={form.city} onChange={set("city")} placeholder="Rivière du Rempart" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Full address">
                <input className={inputClass} value={form.full_address} onChange={set("full_address")} placeholder="Street, building" />
              </Field>
            </div>
          </div>

          <div className="border-t pt-4 text-sm font-semibold text-gray-900">Branch partner login</div>
          <p className="-mt-2 text-xs text-gray-600">
            This person manages only this branch: offers, deals, menu, bookings, staff and settings.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Full name *">
              <input className={inputClass} value={form.admin_full_name} onChange={set("admin_full_name")} />
            </Field>
            <Field label="Email *">
              <input className={inputClass} type="email" value={form.admin_email} onChange={set("admin_email")} />
            </Field>
            <Field label="Password * (min 8)">
              <input className={inputClass} type="password" value={form.admin_password} onChange={set("admin_password")} />
            </Field>
          </div>

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-full border border-gray-200 px-4 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-full bg-[#771FA8] px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Adding..." : "Add branch"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-gray-600">Loading branches...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {branches.map((b) => {
            const isActive = String(b.id) === String(activeId) || (!activeId && b.id === branches[0]?.id);
            return (
              <div key={b.id} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F4E7D1]">
                      <Building2 className="h-5 w-5 text-[#771FA8]" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{b.name}</div>
                      <div className="text-xs text-gray-600">{[b.area, b.city].filter(Boolean).join(", ") || "No location yet"}</div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      b.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {b.is_active ? "Visible" : "Hidden"}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
                  <Users className="h-4 w-4" />
                  {b.branch_admins?.length
                    ? b.branch_admins.map((a) => a.full_name || a.email).join(", ")
                    : "No branch partner yet (managed by you)"}
                </div>

                <div className="mt-4">
                  {isActive ? (
                    <span className="text-xs font-semibold text-[#771FA8]">Currently managing</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectRestaurant(b.id)}
                      className="h-9 rounded-full border border-gray-200 px-4 text-sm font-medium hover:bg-gray-50"
                    >
                      Switch to this branch
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
