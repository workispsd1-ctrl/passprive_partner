"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Megaphone, Loader2 } from "lucide-react";

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

function Field({ label, required = false, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-2">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function RestaurantAdsRequestPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");

  const [placement, setPlacement] = useState("TOP_LISTING"); // TOP_LISTING | HOME_BANNER | SEARCH_SPONSORED
  const [cityTarget, setCityTarget] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const canSubmit = useMemo(() => {
    if (!selectedRestaurantId) return false;
    if (!placement) return false;
    if (!budget || Number(budget) <= 0) return false;
    if (!startDate || !endDate) return false;
    if (new Date(endDate).getTime() < new Date(startDate).getTime()) return false;
    return true;
  }, [selectedRestaurantId, placement, budget, startDate, endDate]);

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
          .from("restaurants")
          .select("id,name,city,is_active")
          .eq("owner_user_id", userId)
          .order("name", { ascending: true });

        if (error) throw error;

        if (!cancelled) {
          setRestaurants(data || []);
          if (data?.length) {
            setSelectedRestaurantId(String(data[0].id));
            setCityTarget(String(data[0].city || ""));
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load restaurants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleRestaurantChange = (id) => {
    setSelectedRestaurantId(id);
    const r = restaurants.find((x) => String(x.id) === String(id));
    if (r?.city) setCityTarget(String(r.city));
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      setErr("");
      setOk("");

      const payload = {
        restaurant_id: selectedRestaurantId,
        placement,
        city_target: cityTarget.trim() || null,
        budget_mur: Number(budget),
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        status: "PENDING",
      };

      const { error } = await supabaseBrowser.from("restaurant_ad_requests").insert(payload);
      if (error) throw error;

      setOk("Ad request submitted. Our team will review and contact you.");
      setBudget("");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (e) {
      setErr(e?.message || "Failed to submit ad request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}
    >
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        <Card
          title="Promote Your Restaurant"
          subtitle="Request priority placement like top listings, banners, and sponsored search."
        >
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Restaurant" required>
                <select
                  value={selectedRestaurantId}
                  onChange={(e) => handleRestaurantChange(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  {restaurants.length ? (
                    restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.city ? `• ${r.city}` : ""} {r.is_active === false ? "(Inactive)" : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">No restaurant found</option>
                  )}
                </select>
              </Field>

              <Field label="Ad Placement" required>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  <option value="TOP_LISTING">Top Listing</option>
                  <option value="HOME_BANNER">Home Banner</option>
                  <option value="SEARCH_SPONSORED">Sponsored Search</option>
                </select>
              </Field>

              

              <Field label="Budget (MUR)" required>
                <input
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="e.g. 5000"
                />
              </Field>

              <Field label="Start Date" required>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                />
              </Field>

              <Field label="End Date" required>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                />
              </Field>

              <Field label="Contact Phone">
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="+230..."
                />
              </Field>

              <Field label="Contact Email">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                  placeholder="name@example.com"
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-gray-300"
                    placeholder="Tell us your campaign goal, preferred slots, and audience."
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || saving || loading || !restaurants.length}
              className="h-10 rounded-full px-4 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #ff6a00 0%, #ff3d5a 50%, #ff0066 100%)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Submit Ad Request
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
