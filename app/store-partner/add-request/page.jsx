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

export default function StorePartnerAdsRequestPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const [placement, setPlacement] = useState("TOP_LISTING"); // TOP_LISTING | HOME_BANNER | SEARCH_SPONSORED
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const canSubmit = useMemo(() => {
    if (!selectedStoreId) return false;
    if (!placement) return false;
    if (!budget || Number(budget) <= 0) return false;
    if (!startDate || !endDate) return false;
    if (new Date(endDate).getTime() < new Date(startDate).getTime()) return false;
    return true;
  }, [selectedStoreId, placement, budget, startDate, endDate]);

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

        const ownerRes = await supabaseBrowser
          .from("stores")
          .select("id,name,city,is_active")
          .eq("owner_user_id", userId);

        if (ownerRes.error) throw ownerRes.error;

        const memberRes = await supabaseBrowser
          .from("store_members")
          .select("store_id, stores:store_id (id,name,city,is_active)")
          .eq("user_id", userId);

        if (memberRes.error) throw memberRes.error;

        const ownerStores = ownerRes.data || [];
        const memberStores = (memberRes.data || []).map((r) => r.stores).filter(Boolean);

        const merged = new Map();
        [...ownerStores, ...memberStores].forEach((s) => merged.set(String(s.id), s));

        const list = Array.from(merged.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        if (!cancelled) {
          setStores(list);
          if (list.length) setSelectedStoreId(String(list[0].id));
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load stores.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      setErr("");
      setOk("");

      const payload = {
        store_id: selectedStoreId,
        placement,
        budget_mur: Number(budget),
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        status: "PENDING",
      };

      const { error } = await supabaseBrowser.from("store_ad_requests").insert(payload);
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
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        ) : null}
        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</div>
        ) : null}

        <Card
          title="Promote Your Store"
          subtitle="Request top placement for better visibility in app listings."
        >
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-10 rounded-xl bg-gray-100 border border-gray-200" />
              <div className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Store" required>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                >
                  {stores.length ? (
                    stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `• ${s.city}` : ""} {s.is_active === false ? "(Inactive)" : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">No stores found</option>
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
                    placeholder="Campaign objective, preferred slot, and any extra details."
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || saving || loading || !stores.length}
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
