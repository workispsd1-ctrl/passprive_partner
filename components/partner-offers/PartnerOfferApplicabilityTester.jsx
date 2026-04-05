"use client";

import { Search } from "lucide-react";
import { Card, EmptyState, Field, Input, Select, Badge } from "./ui";

const PAYMENT_FLOW_SUGGESTIONS = ["ANY", "PICKUP", "PAYMENT", "BOOKING", "DINE_IN"];

export function PartnerOfferApplicabilityTester({
  offer,
  stores,
  restaurants,
  tester,
  onChange,
  onRun,
  result,
  loading,
}) {
  const onlyStore = stores.length > 0 && restaurants.length === 0;
  const onlyRestaurant = restaurants.length > 0 && stores.length === 0;
  const fixedEntityType = onlyStore ? "STORE" : onlyRestaurant ? "RESTAURANT" : "";
  const entityType = fixedEntityType || tester.entity_type || offer?.owner_entity_type || "STORE";
  const entityOptions = entityType === "RESTAURANT" ? restaurants : stores;
  const matched =
    Array.isArray(result?.offers) &&
    offer?.id &&
    result.offers.some((row) => String(row.id || row.offer_id) === String(offer.id));

  return (
    <Card
      title="Preview / Offer Tester"
      subtitle="Test whether the current merchant offer would apply for one of your own stores or restaurants."
    >
      {!offer?.id ? (
        <EmptyState title="Save the offer first" body="Applicability testing is available after the offer exists." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {fixedEntityType ? (
              <Field label="Entity Type">
                <Input value={fixedEntityType} disabled />
              </Field>
            ) : (
              <Field label="Entity Type">
                <Select value={entityType} onChange={(e) => onChange("entity_type", e.target.value)}>
                  <option value="STORE">Store offer</option>
                  <option value="RESTAURANT">Restaurant offer</option>
                </Select>
              </Field>
            )}

            <Field label="Entity">
              <Select value={tester.entity_id || ""} onChange={(e) => onChange("entity_id", e.target.value)}>
                <option value="">Select entity</option>
                {entityOptions.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Bill Amount">
              <Input value={tester.bill_amount || ""} onChange={(e) => onChange("bill_amount", e.target.value)} inputMode="decimal" />
            </Field>
          </div>

          <Field label="Payment Flow">
            <Input
              list="partner-offer-tester-payment-flow"
              value={tester.payment_flow || ""}
              onChange={(e) => onChange("payment_flow", e.target.value.toUpperCase())}
            />
            <datalist id="partner-offer-tester-payment-flow">
              {PAYMENT_FLOW_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>

          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            Test applicability
          </button>

          {result ? (
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={matched ? "green" : "amber"}>
                  {matched ? "Current offer is eligible" : "Current offer not returned"}
                </Badge>
                <Badge tone="blue">{Array.isArray(result.offers) ? result.offers.length : 0} applicable offer(s)</Badge>
              </div>

              {!matched ? <div className="text-sm text-gray-600">{result.reason || "Likely reason: entity, bill amount, payment flow, dates, or conditions did not match."}</div> : null}

              {Array.isArray(result.offers) && result.offers.length ? (
                <div className="space-y-2">
                  {result.offers.map((row) => (
                    <div key={row.id || row.offer_id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{row.title || row.short_title || row.offer_id}</div>
                      <div className="text-xs text-gray-500">{row.badge_text || row.offer_type || "Applicable merchant offer"}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No applicable offers returned" body="Try a different bill amount, payment flow, or active entity." />
              )}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
