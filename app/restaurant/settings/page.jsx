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
      className="rounded-xl bg-[#DA3224] px-4 py-2 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function DangerButton({ children, onClick, disabled = false }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function parseCSVArray(s) {
  const raw = String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return raw.length ? raw : [];
}

function arrayToCSV(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function safeNum(v, fallback = "") {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   Storage (same idea as your AddRestaurantPage)
   Bucket name you are already using: "restaurants"
========================================================= */
const STORAGE_BUCKET = "restaurants";

async function uploadImages(restaurantId, files, type) {
  const urls = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${type}/${restaurantId}/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    const { error } = await supabaseBrowser.storage.from(STORAGE_BUCKET).upload(path, file);
    if (error) throw error;

    const { data } = supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

/* =========================================================
   File preview grid (same logic as AddRestaurantPage)
========================================================= */
function FilePreviewGrid({ files, onRemove }) {
  if (!files?.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="relative h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(file)}
            alt="preview"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute top-2 right-2 rounded-lg bg-black/60 text-white text-xs px-2 py-1 hover:bg-black"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function UrlGrid({ urls, onRemove }) {
  if (!urls?.length) return <div className="text-sm text-slate-500">No photos yet.</div>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
      {urls.map((u, idx) => (
        <div
          key={`${u}-${idx}`}
          className="group relative h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="photo" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="absolute top-2 right-2 rounded-lg bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Page
========================================================= */
export default function page() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  // Form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [cuisinesText, setCuisinesText] = useState("");
  const [costForTwo, setCostForTwo] = useState("");
  const [slug, setSlug] = useState("");

  const [coverImage, setCoverImage] = useState(""); // final URL saved in DB
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [avgDuration, setAvgDuration] = useState("90");
  const [maxPerSlot, setMaxPerSlot] = useState("");
  const [advanceDays, setAdvanceDays] = useState("30");
  const [isActive, setIsActive] = useState(true);

  // Existing URLs (already saved in DB)
  const [foodUrls, setFoodUrls] = useState([]);
  const [ambienceUrls, setAmbienceUrls] = useState([]);

  // NEW FILES (same logic as AddRestaurantPage)
  const [newFoodFiles, setNewFoodFiles] = useState([]);
  const [newAmbFiles, setNewAmbFiles] = useState([]);
  const [newCoverFile, setNewCoverFile] = useState(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Toast
  const [toast, setToast] = useState({ show: false, tone: "slate", title: "", desc: "" });

  // refs
  const coverRef = useRef(null);
  const foodRef = useRef(null);
  const ambRef = useRef(null);

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

    const { data, error } = await supabaseBrowser
      .from("restaurants")
      .select(
        "id, name, phone, area, city, full_address, cuisines, cost_for_two, slug, cover_image, latitude, longitude, booking_enabled, avg_duration_minutes, max_bookings_per_slot, advance_booking_days, is_active, food_images, ambience_images"
      )
      .eq("owner_user_id", user.id)
      .single();

    if (error) {
      showToast("rose", "Load failed", error.message || "Failed to load restaurant settings.");
      setLoading(false);
      return;
    }

    setRestaurantId(data.id);
    setRestaurant(data);

    setName(data.name || "");
    setPhone(data.phone || "");
    setArea(data.area || "");
    setCity(data.city || "");
    setFullAddress(data.full_address || "");
    setCuisinesText(arrayToCSV(data.cuisines));
    setCostForTwo(data.cost_for_two != null ? String(data.cost_for_two) : "");
    setSlug(data.slug || "");

    setCoverImage(data.cover_image || "");
    setLat(data.latitude != null ? String(data.latitude) : "");
    setLng(data.longitude != null ? String(data.longitude) : "");

    setBookingEnabled(Boolean(data.booking_enabled));
    setAvgDuration(data.avg_duration_minutes != null ? String(data.avg_duration_minutes) : "90");
    setMaxPerSlot(data.max_bookings_per_slot != null ? String(data.max_bookings_per_slot) : "");
    setAdvanceDays(data.advance_booking_days != null ? String(data.advance_booking_days) : "30");
    setIsActive(Boolean(data.is_active));

    setFoodUrls(Array.isArray(data.food_images) ? data.food_images : []);
    setAmbienceUrls(Array.isArray(data.ambience_images) ? data.ambience_images : []);

    // reset pending files
    setNewFoodFiles([]);
    setNewAmbFiles([]);
    setNewCoverFile(null);

    setLoading(false);
  }

  const dirty = useMemo(() => {
    if (!restaurant) return false;
    const cuisinesArr = parseCSVArray(cuisinesText);

    // if you selected any new files, it's dirty
    const hasNewFiles = newFoodFiles.length || newAmbFiles.length || Boolean(newCoverFile);

    return (
      hasNewFiles ||
      (restaurant.name || "") !== name ||
      (restaurant.phone || "") !== phone ||
      (restaurant.area || "") !== area ||
      (restaurant.city || "") !== city ||
      (restaurant.full_address || "") !== fullAddress ||
      JSON.stringify(restaurant.cuisines || []) !== JSON.stringify(cuisinesArr) ||
      String(restaurant.cost_for_two ?? "") !== String(costForTwo ?? "") ||
      (restaurant.slug || "") !== slug ||
      (restaurant.cover_image || "") !== coverImage ||
      String(restaurant.latitude ?? "") !== String(lat ?? "") ||
      String(restaurant.longitude ?? "") !== String(lng ?? "") ||
      Boolean(restaurant.booking_enabled) !== Boolean(bookingEnabled) ||
      String(restaurant.avg_duration_minutes ?? "90") !== String(avgDuration ?? "90") ||
      String(restaurant.max_bookings_per_slot ?? "") !== String(maxPerSlot ?? "") ||
      String(restaurant.advance_booking_days ?? "30") !== String(advanceDays ?? "30") ||
      Boolean(restaurant.is_active) !== Boolean(isActive) ||
      JSON.stringify(restaurant.food_images || []) !== JSON.stringify(foodUrls || []) ||
      JSON.stringify(restaurant.ambience_images || []) !== JSON.stringify(ambienceUrls || [])
    );
  }, [
    restaurant,
    name,
    phone,
    area,
    city,
    fullAddress,
    cuisinesText,
    costForTwo,
    slug,
    coverImage,
    lat,
    lng,
    bookingEnabled,
    avgDuration,
    maxPerSlot,
    advanceDays,
    isActive,
    foodUrls,
    ambienceUrls,
    newFoodFiles,
    newAmbFiles,
    newCoverFile,
  ]);

  async function saveRestaurantUpdates(partialUpdates) {
    if (!restaurantId) return;
    const { data, error } = await supabaseBrowser
      .from("restaurants")
      .update(partialUpdates)
      .eq("id", restaurantId)
      .select(
        "id, name, phone, area, city, full_address, cuisines, cost_for_two, slug, cover_image, latitude, longitude, booking_enabled, avg_duration_minutes, max_bookings_per_slot, advance_booking_days, is_active, food_images, ambience_images"
      )
      .single();

    if (error) throw error;

    setRestaurant(data);
    // refresh local snapshots (important)
    setFoodUrls(Array.isArray(data.food_images) ? data.food_images : []);
    setAmbienceUrls(Array.isArray(data.ambience_images) ? data.ambience_images : []);
    setCoverImage(data.cover_image || "");
  }

  async function onSaveAll() {
    const cuisinesArr = parseCSVArray(cuisinesText);

    if (!name.trim()) return showToast("rose", "Missing name", "Restaurant name is required.");
    if (!slug.trim()) return showToast("rose", "Missing slug", "Slug is required (unique).");

    setSaving(true);
    try {
      // 1) Upload NEW files (same as AddRestaurantPage)
      let uploadedFood = [];
      let uploadedAmb = [];
      let uploadedCover = "";

      if (newFoodFiles.length) {
        uploadedFood = await uploadImages(restaurantId, newFoodFiles, "food");
      }
      if (newAmbFiles.length) {
        uploadedAmb = await uploadImages(restaurantId, newAmbFiles, "ambience");
      }
      if (newCoverFile) {
        const coverArr = await uploadImages(restaurantId, [newCoverFile], "cover");
        uploadedCover = coverArr?.[0] || "";
      }

      // 2) Merge with existing urls
      const finalFood = uniq([...uploadedFood, ...(foodUrls || [])]);
      const finalAmb = uniq([...uploadedAmb, ...(ambienceUrls || [])]);

      // 3) Decide cover
      const finalCover =
        uploadedCover || coverImage || finalFood[0] || finalAmb[0] || "";

      // 4) Update DB
      const updates = {
        name: name.trim(),
        phone: phone.trim() || null,
        area: area.trim() || null,
        city: city.trim() || null,
        full_address: fullAddress.trim() || null,
        cuisines: cuisinesArr.length ? cuisinesArr : null,
        cost_for_two: costForTwo === "" ? null : safeNum(costForTwo, null),
        slug: slugify(slug),
        cover_image: finalCover ? finalCover : null,
        latitude: lat === "" ? null : safeNum(lat, null),
        longitude: lng === "" ? null : safeNum(lng, null),
        booking_enabled: Boolean(bookingEnabled),
        avg_duration_minutes: avgDuration === "" ? 90 : safeNum(avgDuration, 90),
        max_bookings_per_slot: maxPerSlot === "" ? null : safeNum(maxPerSlot, null),
        advance_booking_days: advanceDays === "" ? 30 : safeNum(advanceDays, 30),
        is_active: Boolean(isActive),
        food_images: finalFood.length ? finalFood : null,
        ambience_images: finalAmb.length ? finalAmb : null,
      };

      await saveRestaurantUpdates(updates);

      // 5) Clear pending files
      setNewFoodFiles([]);
      setNewAmbFiles([]);
      setNewCoverFile(null);

      showToast("emerald", "Saved", "Restaurant settings updated.");
    } catch (e) {
      showToast("rose", "Save failed", e?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  /* ===========================
     Password
  ============================ */
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

    if (error) return showToast("rose", "Password update failed", error.message || "Could not update password.");

    setNewPassword("");
    setConfirmPassword("");
    showToast("emerald", "Password updated", "Your login password has been changed.");
  }

  /* ===========================
     Loading
  ============================ */
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
      <div className=" z-40 border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Settings</p>
            <p className="text-base font-semibold text-slate-900">Restaurant settings</p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Switch checked={isActive} disabled={saving} onChange={setIsActive} />
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-900">
                    {isActive ? "Available" : "Unavailable"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isActive ? "Customers can discover your restaurant." : "Hidden from customers."}
                  </p>
                </div>
              </div>

              <Badge tone={bookingEnabled ? "indigo" : "slate"}>
                Booking {bookingEnabled ? "Enabled" : "Disabled"}
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
        {/* 1) Restaurant Details */}
        <Section title="Restaurant details" subtitle="Update public info visible to customers" right={<Badge tone="slate">Public</Badge>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={setName} placeholder="Restaurant name" />
            </div>

            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={setPhone} placeholder="+91…" />
            </div>

            <div className="md:col-span-2">
              <Label>Full address</Label>
              <Textarea value={fullAddress} onChange={setFullAddress} placeholder="House no, street, landmark…" rows={3} />
            </div>

            <div>
              <Label>Area</Label>
              <Input value={area} onChange={setArea} placeholder="Area / locality" />
            </div>

            <div>
              <Label>City</Label>
              <Input value={city} onChange={setCity} placeholder="City" />
            </div>

            <div className="md:col-span-2">
              <Label>Cuisines (comma separated)</Label>
              <Input value={cuisinesText} onChange={setCuisinesText} placeholder="e.g. North Indian, Chinese, Continental" />
              <Hint>Example: “North Indian, Chinese”</Hint>
            </div>

            <div>
              <Label>Cost for two</Label>
              <Input value={costForTwo} onChange={setCostForTwo} type="number" placeholder="e.g. 600" />
            </div>

            
          </div>
        </Section>

        {/* 2) Location */}
        <Section title="Location" subtitle="Map coordinates used for distance and directions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Latitude</Label>
              <Input value={lat} onChange={setLat} placeholder="e.g. 17.3850" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={lng} onChange={setLng} placeholder="e.g. 78.4867" />
            </div>
            <div className="md:col-span-2">
              <Hint>Leave empty if you don’t want to show location right now.</Hint>
            </div>
          </div>
        </Section>

        {/* 3) Booking & Availability */}
        <Section title="Booking & availability" subtitle="Controls booking behavior for customers">
          <div className="grid grid-cols-1 gap-4">
            <Toggle checked={bookingEnabled} onChange={setBookingEnabled} label="Bookings" desc="Enable or disable restaurant bookings in the app." />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <Label>Avg duration (minutes)</Label>
                <Input value={avgDuration} onChange={setAvgDuration} type="number" placeholder="90" />
              </div>

              <div>
                <Label>Max bookings per slot</Label>
                <Input value={maxPerSlot} onChange={setMaxPerSlot} type="number" placeholder="e.g. 10" />
                <Hint>Leave empty for unlimited.</Hint>
              </div>

              <div>
                <Label>Advance booking days</Label>
                <Input value={advanceDays} onChange={setAdvanceDays} type="number" placeholder="30" />
              </div>
            </div>

            <Toggle checked={isActive} onChange={setIsActive} label="Restaurant visibility" desc="If off, restaurant won’t be discoverable by customers." />
          </div>
        </Section>

        {/* 4) Photos (NOW SAME LOGIC AS ADD RESTAURANT) */}
        <Section title="Photos" subtitle="" right="">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cover */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Cover</p>
                  <>
                    <input
                      ref={coverRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setNewCoverFile(e.target.files?.[0] || null)}
                    />
                    <SoftButton onClick={() => coverRef.current?.click()} disabled={saving}>
                      Choose
                    </SoftButton>
                  </>
                </div>

                <div className="mt-4 aspect-[16/10] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  {newCoverFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={URL.createObjectURL(newCoverFile)} alt="cover preview" className="h-full w-full object-cover" />
                  ) : coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverImage} alt="cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                      No cover image
                    </div>
                  )}
                </div>

                {newCoverFile ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Badge tone="amber">Selected (not uploaded)</Badge>
                    <SoftButton onClick={() => setNewCoverFile(null)} disabled={saving}>
                      Remove
                    </SoftButton>
                  </div>
                ) : null}

                
              </div>
            </div>

            {/* Galleries */}
            <div className="lg:col-span-2 space-y-6">
              <GalleryFilesAndUrls
                title="Food photos"
                urls={foodUrls}
                setUrls={setFoodUrls}
                newFiles={newFoodFiles}
                setNewFiles={setNewFoodFiles}
                inputRef={foodRef}
                saving={saving}
              />

              <GalleryFilesAndUrls
                title="Ambience photos"
                urls={ambienceUrls}
                setUrls={setAmbienceUrls}
                newFiles={newAmbFiles}
                setNewFiles={setNewAmbFiles}
                inputRef={ambRef}
                saving={saving}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3  bg-white p-4">
            <div>
              
            </div>
            <PrimaryButton onClick={onSaveAll} disabled={saving || !dirty}>
              Save changes
            </PrimaryButton>
          </div>
        </Section>

        {/* 5) Security */}
        <Section title="Security" subtitle="Change your login password (Supabase Auth)" right={<Badge tone="slate">Private</Badge>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>New password</Label>
              <Input value={newPassword} onChange={setNewPassword} placeholder="••••••••" type="password" />
              <Hint>Minimum 8 characters recommended.</Hint>
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" type="password" />
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

        {/* 6) Danger zone (unchanged) */}
        
      </div>
    </div>
  );
}

/* =========================================================
   Gallery: existing URLs + new local files (same logic)
========================================================= */
function GalleryFilesAndUrls({ title, urls, setUrls, newFiles, setNewFiles, inputRef, saving }) {
  const [url, setUrl] = useState("");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500 mt-1">Pick files to add (upload happens on Save)</p>
        </div>

        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              setNewFiles((prev) => [...prev, ...files]);
              e.target.value = ""; // allow same file re-pick
            }}
          />
          <SoftButton onClick={() => inputRef.current?.click()} disabled={saving}>
            Choose
          </SoftButton>
        </>
      </div>

      {/* Existing urls */}
      <div className="mt-4">
        <Label>Saved photos</Label>
        <UrlGrid
          urls={urls}
          onRemove={(idx) => setUrls((prev) => prev.filter((_, i) => i !== idx))}
        />
      </div>

      {/* New files */}
      <div className="mt-5">
        <Label>New photos (not uploaded yet)</Label>
        {newFiles.length ? (
          <>
            <FilePreviewGrid
              files={newFiles}
              onRemove={(idx) => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
            />
            <div className="mt-3 flex items-center gap-2">
              <Badge tone="amber">{newFiles.length} selected</Badge>
              <SoftButton onClick={() => setNewFiles([])} disabled={saving}>
                Clear selection
              </SoftButton>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">No new files selected.</div>
        )}
      </div>

      
    </div>
  );
}
