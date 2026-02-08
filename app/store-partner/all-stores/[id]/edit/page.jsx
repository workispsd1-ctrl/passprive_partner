"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ArrowLeft, Loader2, Save } from "lucide-react";

function Card({ title, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="font-semibold text-gray-900">{title}</div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        className="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <textarea
        className="mt-2 min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

export default function EditStorePage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params?.id ? String(params.id) : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    name: "",
    category: "",
    city: "",
    region: "",
    postal_code: "",
    address_line1: "",
    address_line2: "",
    phone: "",
    whatsapp: "",
    email: "",
    website: "",
    description: "",
    is_active: true,
    is_featured: false,
  });

  const canSave = useMemo(() => {
    return !!form.name.trim() && !!form.category.trim();
  }, [form]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setOk("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const userId = sess?.session?.user?.id;
        if (!userId) {
          router.replace("/sign-in");
          return;
        }

        const { data, error } = await supabaseBrowser
          .from("stores")
          .select(
            "id,name,category,city,region,postal_code,address_line1,address_line2,phone,whatsapp,email,website,description,is_active,is_featured,owner_user_id"
          )
          .eq("id", storeId)
          .eq("owner_user_id", userId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Store not found or access denied.");

        if (!cancelled) {
          setForm({
            name: data.name || "",
            category: data.category || "",
            city: data.city || "",
            region: data.region || "",
            postal_code: data.postal_code || "",
            address_line1: data.address_line1 || "",
            address_line2: data.address_line2 || "",
            phone: data.phone || "",
            whatsapp: data.whatsapp || "",
            email: data.email || "",
            website: data.website || "",
            description: data.description || "",
            is_active: data.is_active !== false,
            is_featured: !!data.is_featured,
          });
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load store.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, storeId]);

  const onSave = async () => {
    if (!canSave || saving) return;

    try {
      setSaving(true);
      setErr("");
      setOk("");

      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;

      const userId = sess?.session?.user?.id;
      if (!userId) {
        router.replace("/sign-in");
        return;
      }

      const { error } = await supabaseBrowser
        .from("stores")
        .update({
          name: form.name.trim(),
          category: form.category.trim(),
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          postal_code: form.postal_code.trim() || null,
          address_line1: form.address_line1.trim() || null,
          address_line2: form.address_line2.trim() || null,
          phone: form.phone.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          description: form.description.trim() || null,
          is_active: !!form.is_active,
          is_featured: !!form.is_featured,
        })
        .eq("id", storeId)
        .eq("owner_user_id", userId);

      if (error) throw error;

      setOk("Store updated successfully.");
      setTimeout(() => {
        router.push(`/store-partner/all-stores/${storeId}`);
      }, 700);
    } catch (e) {
      setErr(e?.message || "Failed to update store.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push(`/store-partner/all-stores/${storeId}`)}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || saving || loading}
            className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
            style={{
              background:
                "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
            <div className="h-5 w-52 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-28 rounded-2xl bg-gray-100 border border-gray-200" />
          </div>
        ) : null}

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {ok}
          </div>
        ) : null}

        {!loading && !err ? (
          <Card title="Edit Store">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Store Name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              <Field label="Category *" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
              <Field label="City" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
              <Field label="Region" value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} />
              <Field label="Postal Code" value={form.postal_code} onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))} />
              <Field label="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              <Field label="Address Line 1" value={form.address_line1} onChange={(e) => setForm((p) => ({ ...p, address_line1: e.target.value }))} />
              <Field label="Address Line 2" value={form.address_line2} onChange={(e) => setForm((p) => ({ ...p, address_line2: e.target.value }))} />
              <Field label="WhatsApp" value={form.whatsapp} onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))} />
              <Field label="Store Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              <Field label="Website" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
            </div>

            <div className="mt-4">
              <TextArea
                label="Description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="mt-4 flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm((p) => ({ ...p, is_featured: e.target.checked }))}
                />
                Featured
              </label>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
