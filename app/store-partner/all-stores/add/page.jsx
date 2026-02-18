"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  ArrowLeft,
  Loader2,
  Store,
  ShieldCheck,
  MapPin,
  Phone,
  Globe,
  Sparkles,
} from "lucide-react";

const STORE_ROLE = "storepartner";
const MANAGER_ROLE = "manager";

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

function uuid() {
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

export default function AddStoreBranchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");

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

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() &&
      form.category.trim() &&
      form.region.trim() &&
      form.postal_code.trim() &&
      managerEmail.trim() &&
      managerPassword.length >= 6
    );
  }, [form, managerEmail, managerPassword]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));

  const createManagerAccount = async (storeName, phone) => {
    const email = managerEmail.trim().toLowerCase();
    const password = managerPassword;

    if (!email) throw new Error("Manager email is required");
    if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");

    const { data: prevSession } = await supabaseBrowser.auth.getSession();

    const { data: signUpData, error: signUpError } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: storeName || null,
          phone: phone || null,
          role: MANAGER_ROLE,
        },
        emailRedirectTo: `fb-marketplace-bot.web.app/callback`,
      },
    });

    if (signUpError) throw new Error(signUpError.message);

    const newUserId = signUpData.user?.id;
    if (!newUserId) throw new Error("Manager user created, but missing user id.");

    const { error: usersInsertErr } = await supabaseBrowser.from("users").insert({
      id: newUserId,
      email,
      full_name: storeName || null,
      phone: phone || null,
      role: MANAGER_ROLE,
      notifications_enabled: true,
      veg_mode: false,
      membership_tier: "none",
    });

    if (usersInsertErr) {
      throw new Error(
        `Auth user created, but failed to insert into public.users: ${usersInsertErr.message}.`
      );
    }

    try {
      if (signUpData.session && prevSession?.session) {
        await supabaseBrowser.auth.setSession({
          access_token: prevSession.session.access_token,
          refresh_token: prevSession.session.refresh_token,
        });
      }
    } catch {
      // ignore
    }

    return { userId: newUserId, email };
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const { data: sess, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;

      const ownerUserId = sess?.session?.user?.id;
      if (!ownerUserId) {
        router.replace("/sign-in");
        return;
      }

      const manager = await createManagerAccount(form.name.trim(), form.phone?.trim() || null);

      const storeId = uuid();
      let finalSlug = `${slugify(form.name)}-${Math.random().toString(16).slice(2, 6)}`;

      const { error: storeErr } = await supabaseBrowser.from("stores").insert({
        id: storeId,
        owner_user_id: ownerUserId,
        created_by: ownerUserId,
        name: form.name.trim(),
        slug: finalSlug,
        description: form.description?.trim() || null,
        category: form.category?.trim() || null,
        city: form.city?.trim() || null,
        region: form.region?.trim() || null,
        postal_code: form.postal_code?.trim() || null,
        address_line1: form.address_line1?.trim() || null,
        address_line2: form.address_line2?.trim() || null,
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        email: form.email?.trim() || null,
        website: form.website?.trim() || null,
        is_active: !!form.is_active,
        is_featured: !!form.is_featured,
      });

      if (storeErr) {
        if (
          typeof storeErr.message === "string" &&
          storeErr.message.toLowerCase().includes("stores_slug_key")
        ) {
          finalSlug = `${slugify(form.name)}-${Math.random().toString(16).slice(2, 8)}`;
          const retry = await supabaseBrowser.from("stores").insert({
            id: storeId,
            owner_user_id: ownerUserId,
            created_by: ownerUserId,
            name: form.name.trim(),
            slug: finalSlug,
            description: form.description?.trim() || null,
            category: form.category?.trim() || null,
            city: form.city?.trim() || null,
            region: form.region?.trim() || null,
            postal_code: form.postal_code?.trim() || null,
            address_line1: form.address_line1?.trim() || null,
            address_line2: form.address_line2?.trim() || null,
            phone: form.phone?.trim() || null,
            whatsapp: form.whatsapp?.trim() || null,
            email: form.email?.trim() || null,
            website: form.website?.trim() || null,
            is_active: !!form.is_active,
            is_featured: !!form.is_featured,
          });
          if (retry.error) throw retry.error;
        } else {
          throw storeErr;
        }
      }

      const { error: memberErr } = await supabaseBrowser.from("store_members").insert([
        { store_id: storeId, user_id: ownerUserId, role: "owner" },
        { store_id: storeId, user_id: manager.userId, role: "manager" },
      ]);
      if (memberErr) throw memberErr;

      router.push("/store-partner/all-stores");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: '"Space Grotesk", "Sora", sans-serif',
        
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={() => router.push("/store-partner/all-stores")}
            className="h-10 w-fit rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Stores
          </button>

          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
            className="h-11 rounded-full px-5 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
            style={{
              background:
                "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create Branch
          </button>
        </div>

        {/* Hero */}
        <div className="rounded-3xl border border-orange-100 bg-white/70 backdrop-blur p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-semibold text-gray-900">
                Create a New Branch
              </div>
              <div className="text-sm text-gray-600 mt-2 max-w-2xl">
                Add a store branch for your brand. You will create the branch record and a manager login
                in one step. Owner stays linked to all branches.
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-6">
          {/* Main Form */}
          <div className="space-y-6">
            {/* Manager login */}
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">Branch Manager Login</div>
                  <div className="text-sm text-gray-500">
                    A new auth user and `public.users` row will be created.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <Field label="Manager Email *" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} disabled={loading} placeholder="manager@brand.com" />
                <Field label="Manager Password *" value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} disabled={loading} type="password" placeholder="Min 6 characters" />
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Use a unique email for each branch manager.
              </div>
            </section>

            {/* Store details */}
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">Branch Details</div>
                  <div className="text-sm text-gray-500">
                    Each branch is a separate row in `stores`.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <Field label="Store Name *" value={form.name} onChange={set("name")} disabled={loading} placeholder="Adidas Downtown" />
                <Field label="Category *" value={form.category} onChange={set("category")} disabled={loading} placeholder="Fashion, Sportswear" />

                <Field label="City" value={form.city} onChange={set("city")} disabled={loading} placeholder="Port Louis" />
                <Field label="Region *" value={form.region} onChange={set("region")} disabled={loading} placeholder="North District" />

                <Field label="Postal Code *" value={form.postal_code} onChange={set("postal_code")} disabled={loading} placeholder="11101" />
                <Field label="Phone" value={form.phone} onChange={set("phone")} disabled={loading} placeholder="+230 5xxxxxxx" />

                <Field label="Address Line 1" value={form.address_line1} onChange={set("address_line1")} disabled={loading} placeholder="Street, Building, Floor" />
                <Field label="Address Line 2" value={form.address_line2} onChange={set("address_line2")} disabled={loading} placeholder="Landmark (optional)" />

                <Field label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} disabled={loading} placeholder="+230 5xxxxxxx" />
                <Field label="Store Contact Email" value={form.email} onChange={set("email")} disabled={loading} placeholder="store@brand.com" />

                <Field label="Website" value={form.website} onChange={set("website")} disabled={loading} placeholder="https://brand.com" />
              </div>

              <div className="mt-5">
                <label className="text-xs font-semibold text-gray-600">Description</label>
                <textarea
                  className="mt-2 min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Short description of this branch..."
                  disabled={loading}
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-4">
                <Toggle checked={form.is_active} onChange={setBool("is_active")} label="Active" disabled={loading} />
                <Toggle checked={form.is_featured} onChange={setBool("is_featured")} label="Featured" disabled={loading} />
              </div>
            </section>
          </div>

          {/* Side Summary */}
          <aside className="lg:sticky lg:top-6 h-fit rounded-3xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Summary</div>
                <div className="text-xs text-gray-500">Quick validation before submit</div>
              </div>
            </div>

            <SummaryRow label="Store name" value={form.name || "—"} />
            <SummaryRow label="Category" value={form.category || "—"} />
            <SummaryRow label="Region" value={form.region || "—"} />
            <SummaryRow label="Postal code" value={form.postal_code || "—"} />
            <SummaryRow label="Manager email" value={managerEmail || "—"} />

            <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600">
              Once created, the owner will see this branch in their dashboard. The manager will only
              see this branch.
            </div>

            <button
              type="button"
              disabled={!canSubmit || loading}
              onClick={handleSubmit}
              className="w-full h-11 rounded-full px-5 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-orange-200"
              style={{
                background:
                  "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)",
              }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Create Branch
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text", placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        type={type}
        className="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-orange-100"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-700">
      <span className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-orange-500 transition-colors" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm peer-checked:translate-x-5 transition-transform" />
      </span>
      {label}
    </label>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900 truncate max-w-[160px] text-right">{value}</span>
    </div>
  );
}
