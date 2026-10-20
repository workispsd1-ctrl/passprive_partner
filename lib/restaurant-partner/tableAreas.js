import { Sofa, Trees, Sun, Umbrella, Flower2, Wine, DoorClosed, MapPin } from "lucide-react";

// Kinds of seating area a restaurant can split its floor plan into (see restaurant_table_areas.kind).
export const AREA_KINDS = [
  { value: "interior", label: "Interior", icon: Sofa },
  { value: "exterior", label: "Exterior", icon: Trees },
  { value: "rooftop", label: "Rooftop", icon: Sun },
  { value: "terrace", label: "Terrace", icon: Umbrella },
  { value: "garden", label: "Garden", icon: Flower2 },
  { value: "bar", label: "Bar", icon: Wine },
  { value: "private", label: "Private Room", icon: DoorClosed },
  { value: "other", label: "Other", icon: MapPin },
];

export function areaKindMeta(kind) {
  return AREA_KINDS.find((k) => k.value === kind) || AREA_KINDS[AREA_KINDS.length - 1];
}

export function sortAreas(areas) {
  return [...(areas || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
}
