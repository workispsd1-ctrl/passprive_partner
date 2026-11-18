"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { resolveActiveRestaurant } from "@/lib/restaurant-partner/activeRestaurant";
import { showToast } from "@/components/restaurant-dashboard/useToast";

export default function ApplyToBranchesButton({ what, label, disabled = false }) {
  const [source, setSource] = useState(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    resolveActiveRestaurant(supabaseBrowser)
      .then(({ list, active }) => {
        if (!mounted || active?.access !== "master") return;
        const others = list.filter((r) => r.access === "master" && r.id !== active.id).length;
        if (others > 0) {
          setSource(active);
          setCount(others);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!source) return null;

  const apply = async () => {
    if (!window.confirm(`Copy ${label.toLowerCase()} from ${source.name} to your ${count} other branch${count === 1 ? "" : "es"}? Their current ${label.toLowerCase()} will be replaced.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabaseBrowser.rpc("apply_master_settings_to_branches", { p_source: source.id, p_what: what });
      if (error) throw error;
      showToast({ type: "success", title: `${label} applied`, description: `Updated ${data} branch${data === 1 ? "" : "es"}.` });
    } catch (e) {
      showToast({ type: "error", title: "Could not apply to branches", description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={apply}
      disabled={busy || disabled}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Applying..." : `Apply ${label.toLowerCase()} to all branches`}
    </button>
  );
}
