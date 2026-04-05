"use client";

import { Plus, Save, Trash2, Pencil } from "lucide-react";
import { Card, EmptyState, Field, Input, Select } from "./ui";

const CONDITION_OPTIONS = ["MIN_BILL_AMOUNT", "MAX_BILL_AMOUNT", "DAY_OF_WEEK", "TIME_WINDOW", "STORE_TYPE", "PAYMENT_SOURCE"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function PartnerOfferConditionsEditor({
  offerId,
  conditions,
  form,
  onFormChange,
  onAdd,
  onUpdate,
  onEdit,
  onCancelEdit,
  onDelete,
  saving,
  deletingId,
}) {
  const conditionType = form.condition_type || "MIN_BILL_AMOUNT";

  return (
    <Card
      title="Conditions Management"
      subtitle="Use merchant-friendly conditions like minimum bill, valid days, and time windows."
    >
      {!offerId ? (
        <EmptyState title="Save the offer first" body="Conditions can be added after the merchant offer is created." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Condition Type">
              <Select value={conditionType} onChange={(e) => onFormChange("condition_type", e.target.value)}>
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>

            {conditionType === "DAY_OF_WEEK" ? (
              <Field label="Valid Days">
                <Select value={form.condition_value || ""} onChange={(e) => onFormChange("condition_value", e.target.value)}>
                  <option value="">Select day</option>
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : conditionType === "TIME_WINDOW" ? (
              <Field label="Time Window">
                <Input
                  value={form.condition_value || ""}
                  onChange={(e) => onFormChange("condition_value", e.target.value)}
                  placeholder='{"start":"09:00","end":"12:00"}'
                />
              </Field>
            ) : (
              <Field label="Condition Value">
                <Input value={form.condition_value || ""} onChange={(e) => onFormChange("condition_value", e.target.value)} />
              </Field>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={form.id ? onUpdate : onAdd}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {form.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {form.id ? "Save condition" : "Add condition"}
            </button>
            {form.id ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            ) : null}
          </div>

          {conditions.length ? (
            <div className="space-y-3">
              {conditions.map((condition) => (
                <div key={condition.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{condition.condition_type || condition.type}</div>
                    <div className="text-xs text-gray-500">{condition.condition_value || condition.value || condition.display_value || "No value"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(condition)}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(condition)}
                      disabled={deletingId === String(condition.id)}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No conditions yet" body="Add minimum bill, valid days, time window, or other merchant-supported conditions." />
          )}
        </div>
      )}
    </Card>
  );
}
