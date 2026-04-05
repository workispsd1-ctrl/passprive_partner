"use client";

import { Save, Plus, Trash2, Archive } from "lucide-react";
import { Card, Field, Input, Select, Textarea, Toggle } from "./ui";

const OFFER_TYPE_OPTIONS = [
  { value: "PERCENTAGE_DISCOUNT", label: "Percentage discount" },
  { value: "FLAT_DISCOUNT", label: "Flat discount" },
  { value: "CASHBACK", label: "Cashback" },
];

const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

export function PartnerOfferForm({
  form,
  entityType,
  entityOptions,
  selectedEntityIds,
  setSelectedEntityIds,
  applyAllEntities,
  setApplyAllEntities,
  minDate,
  onChange,
  onSubmit,
  onCreateNew,
  onDelete,
  onArchive,
  saving,
  deleting,
  canDelete,
  mode,
}) {
  const entityLabel = entityType === "STORE" ? "Store" : "Restaurant";
  const toggleEntity = (id, checked) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return Array.from(next);
    });
  };

  return (
    <Card
      title={mode === "edit" ? "Edit Merchant Offer" : "Create Merchant Offer"}
      subtitle={`Create simple merchant-funded ${entityLabel.toLowerCase()} offers with business-friendly controls.`}
      right={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            New offer
          </button>
          {mode === "edit" ? (
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Offer Source">
            <Input value="MERCHANT" disabled />
          </Field>

          <Field label={`${entityLabel} Type`}>
            <Input value={entityType} disabled />
          </Field>
        </div>

        <Field label={`Your ${entityLabel}${mode === "create" ? "s" : ""}`}>
          {mode === "create" ? (
            <div className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={applyAllEntities}
                  onChange={(e) => setApplyAllEntities(e.target.checked)}
                />
                Apply to all linked {entityLabel.toLowerCase()}s ({entityOptions.length})
              </label>

              <div className="max-h-48 space-y-2 overflow-auto rounded-2xl border border-gray-200 bg-white p-3">
                {entityOptions.map((entity) => {
                  const checked = applyAllEntities || selectedEntityIds.includes(String(entity.id));
                  return (
                    <label key={entity.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        disabled={applyAllEntities}
                        checked={checked}
                        onChange={(e) => toggleEntity(entity.id, e.target.checked)}
                      />
                      <span>{entity.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <Input
              value={entityOptions.find((entity) => String(entity.id) === String(form.owner_entity_id))?.label || ""}
              disabled
            />
          )}
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <Input value={form.title || ""} onChange={(e) => onChange("title", e.target.value)} />
          </Field>

          <Field label="Short Title">
            <Input value={form.short_title || ""} onChange={(e) => onChange("short_title", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Subtitle">
            <Input value={form.subtitle || ""} onChange={(e) => onChange("subtitle", e.target.value)} />
          </Field>

          <Field label="Badge Text">
            <Input value={form.badge_text || ""} onChange={(e) => onChange("badge_text", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ribbon Text">
            <Input value={form.ribbon_text || ""} onChange={(e) => onChange("ribbon_text", e.target.value)} />
          </Field>

          <Field label="Banner Image URL">
            <Input
              value={form.banner_image_url || ""}
              onChange={(e) => onChange("banner_image_url", e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea value={form.description || ""} onChange={(e) => onChange("description", e.target.value)} />
        </Field>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Offer Type">
            <Select value={form.offer_type || "PERCENTAGE_DISCOUNT"} onChange={(e) => onChange("offer_type", e.target.value)}>
              {OFFER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={
              form.offer_type === "PERCENTAGE_DISCOUNT"
                ? "Benefit Value (%)"
                : form.offer_type === "CASHBACK"
                ? "Benefit Value"
                : "Benefit Value"
            }
          >
            <Input
              value={form.benefit_value || ""}
              onChange={(e) => onChange("benefit_value", e.target.value)}
              inputMode="decimal"
            />
          </Field>

          <Field label="Max Discount">
            <Input value={form.max_discount_amount || ""} onChange={(e) => onChange("max_discount_amount", e.target.value)} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Currency">
            <Input value={form.currency_code || ""} onChange={(e) => onChange("currency_code", e.target.value.toUpperCase())} />
          </Field>

          <Field label="Minimum Bill">
            <Input value={form.min_bill_amount || ""} onChange={(e) => onChange("min_bill_amount", e.target.value)} inputMode="decimal" />
          </Field>

          <Field label="Priority">
            <Input value={form.priority || ""} onChange={(e) => onChange("priority", e.target.value)} inputMode="numeric" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Lifecycle Status">
            <Select value={form.status || "DRAFT"} onChange={(e) => onChange("status", e.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Offer Start Date">
            <Input type="date" min={minDate} value={form.starts_at || ""} onChange={(e) => onChange("starts_at", e.target.value)} />
          </Field>

          <Field label="Offer End Date">
            <Input type="date" min={form.starts_at || minDate} value={form.ends_at || ""} onChange={(e) => onChange("ends_at", e.target.value)} />
          </Field>
        </div>

        <Field label="Terms & Conditions">
          <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            {Object.keys(form.accepted_terms || {}).map((term) => (
              <label key={term} className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.accepted_terms?.[term])}
                  onChange={(e) =>
                    onChange("accepted_terms", {
                      ...(form.accepted_terms || {}),
                      [term]: e.target.checked,
                    })
                  }
                />
                <span>{term}</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Toggle checked={Boolean(form.is_active)} onChange={(checked) => onChange("is_active", checked)} label="Offer active" description="You can pause or archive this offer later." />
          <Toggle checked={Boolean(form.is_stackable)} onChange={(checked) => onChange("is_stackable", checked)} label="Stackable offer" description="Allow this merchant offer to stack with others." />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(119,31,168,0.28)] disabled:opacity-60"
          style={{ background: "linear-gradient(90deg, #771FA8 0%, rgba(119,31,168,0.78) 50%, #5B1685 100%)" }}
        >
          {mode === "edit" ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {mode === "edit" ? "Save Merchant Offer" : "Create Merchant Offer"}
        </button>
      </div>
    </Card>
  );
}
