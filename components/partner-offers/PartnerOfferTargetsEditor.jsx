"use client";

import { Plus, Trash2 } from "lucide-react";
import { Card, EmptyState, Field, Input, Select } from "./ui";

const TARGET_OPTIONS = ["STORE", "RESTAURANT", "CITY", "AREA", "CATEGORY", "SUBCATEGORY", "TAG"];

export function PartnerOfferTargetsEditor({
  offerId,
  targets,
  form,
  onFormChange,
  onAdd,
  onDelete,
  entitiesByType,
  saving,
  deletingId,
}) {
  const type = form.target_type || "STORE";
  const entityOptions = entitiesByType[type] || [];
  const usesEntitySelect = type === "STORE" || type === "RESTAURANT";

  return (
    <Card
      title="Target Management"
      subtitle="Keep merchant targeting practical and limited to your own business scope."
    >
      {!offerId ? (
        <EmptyState title="Save the offer first" body="Targets can be managed after the merchant offer is created." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target Type">
              <Select value={type} onChange={(e) => onFormChange("target_type", e.target.value)}>
                {TARGET_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Target Value">
              {usesEntitySelect ? (
                <Select value={form.target_value || ""} onChange={(e) => onFormChange("target_value", e.target.value)}>
                  <option value="">Select target</option>
                  {entityOptions.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={form.target_value || ""} onChange={(e) => onFormChange("target_value", e.target.value)} />
              )}
            </Field>
          </div>

          <button
            type="button"
            onClick={onAdd}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Add target
          </button>

          {targets.length ? (
            <div className="space-y-3">
              {targets.map((target) => (
                <div key={target.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{target.target_type || target.type}</div>
                    <div className="text-xs text-gray-500">{target.target_label || target.target_value || target.value}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(target)}
                    disabled={deletingId === String(target.id)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No merchant targets yet" body="Add store, restaurant, city, area, category, subcategory, or tag targets as needed." />
          )}
        </div>
      )}
    </Card>
  );
}
