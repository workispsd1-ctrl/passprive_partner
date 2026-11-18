"use client";

import { useI18n } from "@/lib/i18n";
import { setBranchScope } from "@/lib/restaurant-partner/activeRestaurant";

export default function BranchScopeToggle({ allBranches, onChange }) {
  const { t } = useI18n();
  const pick = (all) => {
    if (all === allBranches) return;
    setBranchScope(all ? "all" : "branch");
    onChange(all);
  };
  const btn = (active) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5">
      <button type="button" className={btn(!allBranches)} onClick={() => pick(false)}>
        {t("scope.thisBranch")}
      </button>
      <button type="button" className={btn(allBranches)} onClick={() => pick(true)}>
        {t("scope.allBranches")}
      </button>
    </div>
  );
}
