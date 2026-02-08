"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* =========================================================
   Clean Pro UI helpers (NO gradients, NO slate-50 background)
========================================================= */
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200 ${className}`} />;
}

function Toast({ show, tone = "slate", title, desc, onClose }) {
  if (!show) return null;
  const map = {
    slate: "border-slate-200 bg-white text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className="fixed top-4 right-4 z-[90] w-[360px] max-w-[90vw]">
      <div className={`rounded-2xl border p-4 shadow-lg ${map[tone] || map.slate}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            {desc ? <p className="mt-1 text-sm opacity-80">{desc}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-sm hover:bg-black/5 active:scale-[0.98]"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Label({ children }) {
  return <p className="text-xs text-slate-600 mb-2">{children}</p>;
}

function Hint({ children }) {
  return <p className="text-xs text-slate-500 mt-2">{children}</p>;
}

function Input({ value, onChange, placeholder, type = "text", disabled = false }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value ?? ""}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
    />
  );
}

function SoftButton({ children, onClick, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-[#5D5FEF] hover:bg-[#4D4FDF] px-4 py-2 text-sm font-medium text-white active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-[#5D5FEF] focus:ring-offset-2"
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {desc ? <p className="text-xs text-slate-500 mt-1">{desc}</p> : null}
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm">{Boolean(checked) ? "On" : "Off"}</span>
        </label>
      </div>
    </div>
  );
}

function Badge({ tone = "slate", children }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}

function Switch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition active:scale-[0.98] ${
        checked ? "bg-emerald-500 border-emerald-500" : "bg-slate-200 border-slate-300"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      aria-pressed={checked}
      aria-label="Toggle active"
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* =========================================================
   Utils
========================================================= */
function safeNum(v, fallback = "") {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   Storage
========================================================= */
const STORAGE_BUCKET = "restaurants";

async function uploadImage(corporateId, file, type) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `corporate/${type}/${corporateId}/${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;

  const { error } = await supabaseBrowser.storage.from(STORAGE_BUCKET).upload(path, file);
  if (error) throw error;

  const { data } = supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* =========================================================
   Page
========================================================= */
export default function Page() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [corporateId, setCorporateId] = useState(null);
  const [corporate, setCorporate] = useState(null);

  // Form fields
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  
  const [maxEmployees, setMaxEmployees] = useState("");
  const [passValidity, setPassValidity] = useState("30");
  
  const [isActive, setIsActive] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  const [newLogoFile, setNewLogoFile] = useState(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Toast
  const [toast, setToast] = useState({ show: false, tone: "slate", title: "", desc: "" });

  const logoRef = useRef(null);

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(tone, title, desc) {
    setToast({ show: true, tone, title, desc });
    setTimeout(() => setToast((p) => ({ ...p, show: false })), 2500);
  }

  async function loadSettings() {
    setLoading(true);

    const {
      data: { user },
      error: uErr,
    } = await supabaseBrowser.auth.getUser();

    if (uErr) {
      showToast("rose", "Auth error", uErr.message || "Failed to get user.");
      setLoading(false);
      return;
    }

    if (!user) {
      showToast("rose", "Not logged in", "Please login again.");
      setLoading(false);
      return;
    }

    // Fetch from corporates table
    const { data, error } = await supabaseBrowser
      .from("corporates")
      .select("*")
      .eq("owner_user_id", user.id)
      .single();

    if (error) {
      showToast("rose", "Load failed", error.message || "Failed to load corporate settings.");
      setLoading(false);
      return;
    }

    setCorporateId(data.id);
    setCorporate(data);

    setCompanyName(data.company_name || "");
    setContactPerson(data.contact_person || "");
    setEmail(data.email || "");
    setPhone(data.phone || "");
    setAddress(data.address || "");
    setCity(data.city || "");
    setState(data.state || "");
    setPincode(data.pincode || "");
    
    setRegistrationNumber(data.registration_number || "");
    setGstNumber(data.gst_number || "");
    setPanNumber(data.pan_number || "");
    
    setMaxEmployees(data.max_employees != null ? String(data.max_employees) : "");
    setPassValidity(data.pass_validity_days != null ? String(data.pass_validity_days) : "30");
    
    setIsActive(Boolean(data.is_active));
    setAutoApprove(Boolean(data.auto_approve_employees));
    
    setLogoUrl(data.logo_url || "");
    
    setNewLogoFile(null);

    setLoading(false);
  }

  const dirty = useMemo(() => {
    if (!corporate) return false;
    
    const hasNewLogo = Boolean(newLogoFile);

    return (
      hasNewLogo ||
      (corporate.company_name || "") !== companyName ||
      (corporate.contact_person || "") !== contactPerson ||
      (corporate.email || "") !== email ||
      (corporate.phone || "") !== phone ||
      (corporate.address || "") !== address ||
      (corporate.city || "") !== city ||
      (corporate.state || "") !== state ||
      (corporate.pincode || "") !== pincode ||
      (corporate.registration_number || "") !== registrationNumber ||
      (corporate.gst_number || "") !== gstNumber ||
      (corporate.pan_number || "") !== panNumber ||
      String(corporate.max_employees ?? "") !== String(maxEmployees ?? "") ||
      String(corporate.pass_validity_days ?? "30") !== String(passValidity ?? "30") ||
      Boolean(corporate.is_active) !== Boolean(isActive) ||
      Boolean(corporate.auto_approve_employees) !== Boolean(autoApprove) ||
      (corporate.logo_url || "") !== logoUrl
    );
  }, [
    corporate,
    companyName,
    contactPerson,
    email,
    phone,
    address,
    city,
    state,
    pincode,
    registrationNumber,
    gstNumber,
    panNumber,
    maxEmployees,
    passValidity,
    isActive,
    autoApprove,
    logoUrl,
    newLogoFile,
  ]);

  async function saveCorporateUpdates(partialUpdates) {
    if (!corporateId) return;
    const { data, error } = await supabaseBrowser
      .from("corporates")
      .update(partialUpdates)
      .eq("id", corporateId)
      .select()
      .single();

    if (error) throw error;

    setCorporate(data);
    setLogoUrl(data.logo_url || "");
  }

  async function onSaveAll() {
    if (!companyName.trim()) {
      return showToast("rose", "Missing name", "Company name is required.");
    }
    if (!email.trim()) {
      return showToast("rose", "Missing email", "Email is required.");
    }

    setSaving(true);
    try {
      let uploadedLogo = "";

      if (newLogoFile) {
        uploadedLogo = await uploadImage(corporateId, newLogoFile, "logo");
      }

      const finalLogo = uploadedLogo || logoUrl || "";

      const updates = {
        company_name: companyName.trim(),
        contact_person: contactPerson.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        registration_number: registrationNumber.trim() || null,
        gst_number: gstNumber.trim() || null,
        pan_number: panNumber.trim() || null,
        max_employees: maxEmployees === "" ? null : safeNum(maxEmployees, null),
        pass_validity_days: passValidity === "" ? 30 : safeNum(passValidity, 30),
        is_active: Boolean(isActive),
        auto_approve_employees: Boolean(autoApprove),
        logo_url: finalLogo || null,
      };

      await saveCorporateUpdates(updates);

      setNewLogoFile(null);

      showToast("emerald", "Saved", "Corporate settings updated successfully.");
    } catch (e) {
      showToast("rose", "Save failed", e?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) {
      return showToast("rose", "Weak password", "Password must be at least 8 characters.");
    }
    if (newPassword !== confirmPassword) {
      return showToast("rose", "Mismatch", "Passwords do not match.");
    }

    setSaving(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (error) {
      return showToast("rose", "Password update failed", error.message || "Could not update password.");
    }

    setNewPassword("");
    setConfirmPassword("");
    showToast("emerald", "Password updated", "Your login password has been changed.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[420px]" />
            <Skeleton className="h-[420px]" />
          </div>
          <Skeleton className="h-[360px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Toast
        show={toast.show}
        tone={toast.tone}
        title={toast.title}
        desc={toast.desc}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />

      {/* Top bar */}
      <div className="z-40 border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Settings</p>
            <p className="text-base font-semibold text-slate-900">Corporate settings</p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Switch checked={isActive} disabled={saving} onChange={setIsActive} />
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-900">
                    {isActive ? "Active" : "Inactive"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isActive ? "Corporate account is active." : "Account is disabled."}
                  </p>
                </div>
              </div>

              <Badge tone={autoApprove ? "indigo" : "slate"}>
                Auto-approve {autoApprove ? "On" : "Off"}
              </Badge>

              {saving ? (
                <Badge tone="amber">Saving…</Badge>
              ) : dirty ? (
                <Badge tone="rose">Unsaved</Badge>
              ) : (
                <Badge tone="emerald">Saved</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onSaveAll} disabled={saving || !dirty}>
              Save changes
            </PrimaryButton>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* 1) Company Details */}
        <Section
          title="Company details"
          subtitle="Basic information about your organization"
          right={<Badge tone="slate">Public</Badge>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Label>Company name *</Label>
              <Input value={companyName} onChange={setCompanyName} placeholder="Company name" />
            </div>

            <div>
              <Label>Contact person</Label>
              <Input value={contactPerson} onChange={setContactPerson} placeholder="Full name" />
            </div>

            <div>
              <Label>Email *</Label>
              <Input value={email} onChange={setEmail} placeholder="company@example.com" type="email" />
            </div>

            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={setPhone} placeholder="+91…" />
            </div>

            <div className="md:col-span-2">
              <Label>Address</Label>
              <Textarea
                value={address}
                onChange={setAddress}
                placeholder="Full company address"
                rows={3}
              />
            </div>

            <div>
              <Label>City</Label>
              <Input value={city} onChange={setCity} placeholder="City" />
            </div>

            <div>
              <Label>State</Label>
              <Input value={state} onChange={setState} placeholder="State" />
            </div>

            <div>
              <Label>Pincode</Label>
              <Input value={pincode} onChange={setPincode} placeholder="Pincode" />
            </div>
          </div>
        </Section>

        {/* 2) Legal & Compliance */}
        <Section
          title="Legal & compliance"
          subtitle="Registration and tax information"
          right={<Badge tone="slate">Private</Badge>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Registration number</Label>
              <Input
                value={registrationNumber}
                onChange={setRegistrationNumber}
                placeholder="Company registration number"
              />
              <Hint>Certificate of Incorporation number</Hint>
            </div>

            <div>
              <Label>GST number</Label>
              <Input value={gstNumber} onChange={setGstNumber} placeholder="GST number" />
            </div>

            <div>
              <Label>PAN number</Label>
              <Input value={panNumber} onChange={setPanNumber} placeholder="PAN number" />
            </div>
          </div>
        </Section>

        {/* 3) Pass Management */}
        <Section title="Pass management" subtitle="Configure employee pass settings">
          <div className="grid grid-cols-1 gap-4">
            <Toggle
              checked={autoApprove}
              onChange={setAutoApprove}
              label="Auto-approve employees"
              desc="Automatically approve employee registrations without manual review."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label>Maximum employees</Label>
                <Input
                  value={maxEmployees}
                  onChange={setMaxEmployees}
                  type="number"
                  placeholder="e.g. 100"
                />
                <Hint>Leave empty for unlimited employees.</Hint>
              </div>

              <div>
                <Label>Pass validity (days)</Label>
                <Input
                  value={passValidity}
                  onChange={setPassValidity}
                  type="number"
                  placeholder="30"
                />
                <Hint>Default validity period for employee passes.</Hint>
              </div>
            </div>

            <Toggle
              checked={isActive}
              onChange={setIsActive}
              label="Corporate account status"
              desc="If off, corporate account will be disabled and employees won't be able to use passes."
            />
          </div>
        </Section>

        {/* 4) Branding */}
        <Section title="Branding" subtitle="Upload your company logo">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Company logo</p>
                  <>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setNewLogoFile(e.target.files?.[0] || null)}
                    />
                    <SoftButton onClick={() => logoRef.current?.click()} disabled={saving}>
                      Choose
                    </SoftButton>
                  </>
                </div>

                <div className="mt-4 aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  {newLogoFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(newLogoFile)}
                      alt="logo preview"
                      className="h-full w-full object-cover"
                    />
                  ) : logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                      No logo
                    </div>
                  )}
                </div>

                {newLogoFile ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Badge tone="amber">Selected (not uploaded)</Badge>
                    <SoftButton onClick={() => setNewLogoFile(null)} disabled={saving}>
                      Remove
                    </SoftButton>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Logo guidelines</p>
                <ul className="mt-3 space-y-2 text-xs text-slate-600">
                  <li>• Recommended size: 512x512 pixels or higher</li>
                  <li>• Accepted formats: JPG, PNG, SVG</li>
                  <li>• Square ratio works best</li>
                  <li>• Maximum file size: 5MB</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 bg-white p-4">
            <div></div>
            <PrimaryButton onClick={onSaveAll} disabled={saving || !dirty}>
              Save changes
            </PrimaryButton>
          </div>
        </Section>

        {/* 5) Security */}
        <Section
          title="Security"
          subtitle="Change your login password (Supabase Auth)"
          right={<Badge tone="slate">Private</Badge>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>New password</Label>
              <Input
                value={newPassword}
                onChange={setNewPassword}
                placeholder="••••••••"
                type="password"
              />
              <Hint>Minimum 8 characters recommended.</Hint>
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                type="password"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Update password</p>
              <p className="text-xs text-slate-500 mt-1">Updates password in the auth system.</p>
            </div>
            <PrimaryButton onClick={changePassword} disabled={saving}>
              Change password
            </PrimaryButton>
          </div>
        </Section>
      </div>
    </div>
  );
}