"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ArrowLeft, Loader2, Save, Shield, CreditCard } from "lucide-react";

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="font-semibold text-gray-900">{title}</div>
        {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-2">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function safeNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asText(v) {
  const t = String(v || "").trim();
  return t || null;
}

const PAYMENT_DEFAULTS = {
  legal_business_name: "",
  display_name_on_invoice: "",
  payout_method: "BANK_TRANSFER",
  beneficiary_name: "",
  bank_name: "",
  account_number: "",
  ifsc: "",
  iban: "",
  swift: "",
  payout_upi_id: "",
  tax_id_label: "BRN",
  tax_id_value: "",
  billing_email: "",
  billing_phone: "",
  notes: "",
};

function normalizeMemberStores(rows) {
  const out = [];
  (rows || []).forEach((row) => {
    const linked = row?.stores;
    if (!linked) return;
    if (Array.isArray(linked)) {
      linked.forEach((s) => {
        if (s?.id) out.push(s);
      });
      return;
    }
    if (linked?.id) out.push(linked);
  });
  return out;
}

export default function StorePartnerSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [userEmail, setUserEmail] = useState("");

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const [form, setForm] = useState({
    name: "",
    category: "",
    subcategory: "",
    tags: "",
    description: "",
    phone: "",
    whatsapp: "",
    email: "",
    website: "",
    location_name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    region: "",
    country: "Mauritius",
    postal_code: "",
    lat: "",
    lng: "",
    google_place_id: "",
    is_active: true,
    is_featured: false,
    instagram: "",
    facebook: "",
    tiktok: "",
    maps: "",
  });

  const [paymentByStore, setPaymentByStore] = useState({});
  const [paymentForm, setPaymentForm] = useState(PAYMENT_DEFAULTS);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setOk("");

        const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const u = sess?.session?.user;
        if (!u?.id) {
          router.replace("/sign-in");
          return;
        }

        if (cancelled) return;
        setUserEmail(String(u.email || ""));

        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("*")
          .eq("owner_user_id", u.id)
          .order("name", { ascending: true });

        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id(*)")
          .eq("user_id", u.id);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = normalizeMemberStores(memberRes.data || []);

        const map = new Map();
        [...ownerStores, ...memberStores].forEach((s) => map.set(String(s.id), s));

        const allStores = Array.from(map.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        const storeIds = Array.from(new Set(allStores.map((s) => String(s.id)).filter(Boolean)));

        let paymentMap = {};
        if (storeIds.length) {
          const paymentRes = await supabaseBrowser
            .from("store_payment_details")
            .select("*")
            .in("store_id", storeIds);

          if (paymentRes.error) throw paymentRes.error;

          (paymentRes.data || []).forEach((p) => {
            paymentMap[String(p.store_id)] = p;
          });
        }

        if (cancelled) return;
        setStores(allStores);
        setPaymentByStore(paymentMap);

        if (allStores.length) {
          const first = allStores[0];
          const firstId = String(first.id);
          setSelectedStoreId(firstId);
          hydrateForm(first, setForm);
          hydratePaymentForm(paymentMap[firstId], first, setPaymentForm);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const selectedStore = useMemo(
    () => stores.find((s) => String(s.id) === String(selectedStoreId)) || null,
    [stores, selectedStoreId]
  );

  const canSaveStore = useMemo(() => !!form.name.trim(), [form.name]);

  const canSavePayment = useMemo(() => {
    if (!paymentForm.legal_business_name.trim()) return false;
    if (!paymentForm.payout_method) return false;
    if (paymentForm.payout_method === "UPI" && !paymentForm.payout_upi_id.trim()) return false;
    if (
      paymentForm.payout_method === "BANK_TRANSFER" &&
      (!paymentForm.account_number.trim() || !paymentForm.beneficiary_name.trim())
    )
      return false;
    return true;
  }, [paymentForm]);

  const canChangePassword = useMemo(() => {
    return newPassword.length >= 6 && confirmPassword.length >= 6 && newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const onStoreSelect = (id) => {
    setSelectedStoreId(id);
    const s = stores.find((x) => String(x.id) === String(id));
    if (s) {
      hydrateForm(s, setForm);
      hydratePaymentForm(paymentByStore[String(id)], s, setPaymentForm);
    }
    setErr("");
    setOk("");
  };

  const handleSaveStore = async () => {
    if (!selectedStoreId || !canSaveStore || savingStore) return;

    try {
      setSavingStore(true);
      setErr("");
      setOk("");

      const tagsArray = form.tags ? form.tags.split(",").map((x) => x.trim()).filter(Boolean) : [];

      const social_links = {
        instagram: form.instagram || undefined,
        facebook: form.facebook || undefined,
        tiktok: form.tiktok || undefined,
        maps: form.maps || undefined,
        website: form.website || undefined,
      };

      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        subcategory: form.subcategory.trim() || null,
        tags: tagsArray,
        description: form.description.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        social_links,
        location_name: form.location_name.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        country: form.country.trim() || "Mauritius",
        postal_code: form.postal_code.trim() || null,
        lat: safeNum(form.lat),
        lng: safeNum(form.lng),
        google_place_id: form.google_place_id.trim() || null,
        is_active: !!form.is_active,
        is_featured: !!form.is_featured,
      };

      const { error } = await supabaseBrowser.from("stores").update(payload).eq("id", selectedStoreId);
      if (error) throw error;

      setStores((prev) => prev.map((s) => (String(s.id) === String(selectedStoreId) ? { ...s, ...payload } : s)));
      setOk("Store settings updated.");
    } catch (e) {
      setErr(e?.message || "Failed to update store.");
    } finally {
      setSavingStore(false);
    }
  };

  const handleSavePayment = async () => {
    if (!selectedStoreId || !canSavePayment || savingPayment) return;

    try {
      setSavingPayment(true);
      setErr("");
      setOk("");

      const payload = {
        store_id: selectedStoreId,
        legal_business_name: paymentForm.legal_business_name.trim(),
        display_name_on_invoice: asText(paymentForm.display_name_on_invoice),
        payout_method: paymentForm.payout_method,
        beneficiary_name: asText(paymentForm.beneficiary_name),
        bank_name: asText(paymentForm.bank_name),
        account_number: asText(paymentForm.account_number),
        ifsc: asText(paymentForm.ifsc),
        iban: asText(paymentForm.iban),
        swift: asText(paymentForm.swift),
        payout_upi_id: asText(paymentForm.payout_upi_id),
        settlement_cycle: "T+1",
        currency: "MUR",
        tax_id_label: paymentForm.tax_id_label || "BRN",
        tax_id_value: asText(paymentForm.tax_id_value),
        billing_email: asText(paymentForm.billing_email),
        billing_phone: asText(paymentForm.billing_phone),
        notes: asText(paymentForm.notes),
      };

      const { data, error } = await supabaseBrowser
        .from("store_payment_details")
        .upsert(payload, { onConflict: "store_id" })
        .select("*")
        .single();

      if (error) throw error;

      setPaymentByStore((prev) => ({ ...prev, [String(selectedStoreId)]: data }));
      if (selectedStore) hydratePaymentForm(data, selectedStore, setPaymentForm);
      setOk("Payment details updated.");
    } catch (e) {
      setErr(e?.message || "Failed to update payment details.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleChangePassword = async () => {
    if (!canChangePassword || savingPassword) return;

    try {
      setSavingPassword(true);
      setErr("");
      setOk("");

      const { error } = await supabaseBrowser.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setOk("Password updated successfully.");
    } catch (e) {
      setErr(e?.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/store-partner/dashboard")}
            className="h-10 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
            <div className="h-5 w-48 rounded-xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-11 rounded-2xl bg-gray-100 border border-gray-200" />
            <div className="h-28 rounded-2xl bg-gray-100 border border-gray-200" />
          </div>
        ) : (
          <>
            <Card title="Account Security" subtitle="Password is per logged-in owner account (not per store).">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Logged-in Email">
                  <input
                    value={userEmail}
                    disabled
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 text-sm"
                  />
                </Field>

                <Field label="New Password">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  />
                </Field>

                <Field label="Confirm Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  />
                </Field>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={!canChangePassword || savingPassword}
                  className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                  style={{
                    background:
                      "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                  }}
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Update Password
                </button>
              </div>
            </Card>

            <Card title="Store Settings" subtitle="Select a store and edit its details.">
              <div className="space-y-5">
                <Field label="Select Store">
                  <select
                    value={selectedStoreId}
                    onChange={(e) => onStoreSelect(e.target.value)}
                    className="h-11 w-full md:w-[420px] rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `• ${s.city}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Store Name">
                    <input
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Category">
                    <input
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Subcategory">
                    <input
                      value={form.subcategory}
                      onChange={(e) => setForm((p) => ({ ...p, subcategory: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Tags (comma separated)">
                    <input
                      value={form.tags}
                      onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="WhatsApp">
                    <input
                      value={form.whatsapp}
                      onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Website">
                    <input
                      value={form.website}
                      onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Location Name">
                    <input
                      value={form.location_name}
                      onChange={(e) => setForm((p) => ({ ...p, location_name: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Address Line 1">
                    <input
                      value={form.address_line1}
                      onChange={(e) => setForm((p) => ({ ...p, address_line1: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Address Line 2">
                    <input
                      value={form.address_line2}
                      onChange={(e) => setForm((p) => ({ ...p, address_line2: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="City">
                    <input
                      value={form.city}
                      onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Region">
                    <input
                      value={form.region}
                      onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Country">
                    <input
                      value={form.country}
                      onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Postal Code">
                    <input
                      value={form.postal_code}
                      onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Latitude">
                    <input
                      value={form.lat}
                      onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      value={form.lng}
                      onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Google Place ID">
                    <input
                      value={form.google_place_id}
                      onChange={(e) => setForm((p) => ({ ...p, google_place_id: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Instagram">
                    <input
                      value={form.instagram}
                      onChange={(e) => setForm((p) => ({ ...p, instagram: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Facebook">
                    <input
                      value={form.facebook}
                      onChange={(e) => setForm((p) => ({ ...p, facebook: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="TikTok">
                    <input
                      value={form.tiktok}
                      onChange={(e) => setForm((p) => ({ ...p, tiktok: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                  <Field label="Maps URL">
                    <input
                      value={form.maps}
                      onChange={(e) => setForm((p) => ({ ...p, maps: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-gray-300"
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-6">
                  <Toggle
                    checked={form.is_active}
                    onChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                    label="Store Active"
                  />
                  <Toggle
                    checked={form.is_featured}
                    onChange={(v) => setForm((p) => ({ ...p, is_featured: v }))}
                    label="Featured"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveStore}
                    disabled={!canSaveStore || savingStore || !selectedStore}
                    className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                    style={{
                      background:
                        "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                    }}
                  >
                    {savingStore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Store
                  </button>
                </div>
              </div>
            </Card>

            <Card
              title="Payment & Payout Details"
              subtitle="Partner can update payout destination and Mauritius tax reference. KYC, commission, and settlement cycle are managed by PassPrive."
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Legal Business Name *">
                    <input
                      value={paymentForm.legal_business_name}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, legal_business_name: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Display Name on Invoice">
                    <input
                      value={paymentForm.display_name_on_invoice}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, display_name_on_invoice: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Payout Method *">
                    <select
                      value={paymentForm.payout_method}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, payout_method: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    >
                      <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                      <option value="UPI">UPI</option>
                      <option value="MANUAL">MANUAL</option>
                    </select>
                  </Field>

                  <Field label="Beneficiary Name">
                    <input
                      value={paymentForm.beneficiary_name}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, beneficiary_name: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Bank Name">
                    <input
                      value={paymentForm.bank_name}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, bank_name: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Account Number">
                    <input
                      value={paymentForm.account_number}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, account_number: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="IFSC">
                    <input
                      value={paymentForm.ifsc}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, ifsc: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="IBAN">
                    <input
                      value={paymentForm.iban}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, iban: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="SWIFT">
                    <input
                      value={paymentForm.swift}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, swift: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Payout UPI ID">
                    <input
                      value={paymentForm.payout_upi_id}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, payout_upi_id: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Mauritius Tax Type">
                    <select
                      value={paymentForm.tax_id_label}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, tax_id_label: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    >
                      <option value="BRN">BRN</option>
                      <option value="VAT">VAT</option>
                    </select>
                  </Field>

                  <Field label="Tax Number (BRN/VAT)">
                    <input
                      value={paymentForm.tax_id_value}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, tax_id_value: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Billing Email">
                    <input
                      value={paymentForm.billing_email}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, billing_email: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>

                  <Field label="Billing Phone">
                    <input
                      value={paymentForm.billing_phone}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, billing_phone: e.target.value }))}
                      className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                    />
                  </Field>
                </div>

                <Field label="Notes">
                  <textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                    className="min-h-[90px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-gray-300"
                  />
                </Field>

                <div className="pt-4 border-t border-gray-200 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePayment}
                    disabled={!canSavePayment || savingPayment || !selectedStore}
                    className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                    style={{
                      background:
                        "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
                    }}
                  >
                    {savingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Save Payment Details
                  </button>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function hydrateForm(store, setForm) {
  const social = store?.social_links && typeof store.social_links === "object" ? store.social_links : {};

  setForm({
    name: store?.name || "",
    category: store?.category || "",
    subcategory: store?.subcategory || "",
    tags: Array.isArray(store?.tags) ? store.tags.join(", ") : "",
    description: store?.description || "",
    phone: store?.phone || "",
    whatsapp: store?.whatsapp || "",
    email: store?.email || "",
    website: store?.website || "",
    location_name: store?.location_name || "",
    address_line1: store?.address_line1 || "",
    address_line2: store?.address_line2 || "",
    city: store?.city || "",
    region: store?.region || "",
    country: store?.country || "Mauritius",
    postal_code: store?.postal_code || "",
    lat: store?.lat !== null && store?.lat !== undefined ? String(store.lat) : "",
    lng: store?.lng !== null && store?.lng !== undefined ? String(store.lng) : "",
    google_place_id: store?.google_place_id || "",
    is_active: store?.is_active !== false,
    is_featured: !!store?.is_featured,
    instagram: social?.instagram || "",
    facebook: social?.facebook || "",
    tiktok: social?.tiktok || "",
    maps: social?.maps || "",
  });
}

function hydratePaymentForm(payment, store, setPaymentForm) {
  if (!payment) {
    setPaymentForm({
      ...PAYMENT_DEFAULTS,
      legal_business_name: store?.name || "",
      display_name_on_invoice: store?.name || "",
      billing_email: store?.email || "",
      billing_phone: store?.phone || "",
      tax_id_label: "BRN",
    });
    return;
  }

  setPaymentForm({
    legal_business_name: payment?.legal_business_name || "",
    display_name_on_invoice: payment?.display_name_on_invoice || "",
    payout_method: payment?.payout_method || "BANK_TRANSFER",
    beneficiary_name: payment?.beneficiary_name || "",
    bank_name: payment?.bank_name || "",
    account_number: payment?.account_number || "",
    ifsc: payment?.ifsc || "",
    iban: payment?.iban || "",
    swift: payment?.swift || "",
    payout_upi_id: payment?.payout_upi_id || "",
    tax_id_label: payment?.tax_id_label === "VAT" ? "VAT" : "BRN",
    tax_id_value: payment?.tax_id_value || "",
    billing_email: payment?.billing_email || "",
    billing_phone: payment?.billing_phone || "",
    notes: payment?.notes || "",
  });
}
