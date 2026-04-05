"use client";

import { Save } from "lucide-react";
import { Card, EmptyState, Field, Input } from "./ui";

export function PartnerOfferLimitsEditor({ offerId, limits, onChange, onSave, saving }) {
  return (
    <Card
      title="Usage Limit Management"
      subtitle="Set safe redemption limits for the merchant offer."
    >
      {!offerId ? (
        <EmptyState title="Save the offer first" body="Usage limits can be configured after the merchant offer is created." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Total Redemption Limit">
              <Input value={limits.total_redemption_limit || ""} onChange={(e) => onChange("total_redemption_limit", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Per User Limit">
              <Input value={limits.per_user_redemption_limit || ""} onChange={(e) => onChange("per_user_redemption_limit", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Per Entity Limit">
              <Input value={limits.per_entity_redemption_limit || ""} onChange={(e) => onChange("per_entity_redemption_limit", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Per Day Limit">
              <Input value={limits.per_day_redemption_limit || ""} onChange={(e) => onChange("per_day_redemption_limit", e.target.value)} inputMode="numeric" />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Budget Amount" hint="Optional">
              <Input value={limits.budget_amount || ""} onChange={(e) => onChange("budget_amount", e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Budget Currency" hint="Optional">
              <Input value={limits.budget_currency || ""} onChange={(e) => onChange("budget_currency", e.target.value.toUpperCase())} />
            </Field>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
            Budget fields are optional. Use them only if your backend interprets the offer with spend-based controls; otherwise the redemption limits are enough.
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save limits
          </button>
        </div>
      )}
    </Card>
  );
}
