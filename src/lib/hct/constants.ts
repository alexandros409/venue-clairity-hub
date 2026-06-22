export const CONSULTANT_NAME = "Alexandros Chatziliadis";
export const APP_NAME = "SDT";
export const APP_LONG_NAME = "Service Diagnostic Tool";

export const SHIFTS = [
  { value: "morgen", label: "Morgen-Schicht" },
  { value: "abend", label: "Abend-Schicht" },
] as const;

export const PROBLEM_CATEGORIES = [
  { value: "kitchen_pass", label: "Pass & Flow Impact" },
  { value: "billing_checkout", label: "Billing & Checkout" },
  { value: "service_flow", label: "Service Flow" },
  { value: "staff_fatigue", label: "Staff Fatigue & Morale" },
  { value: "leadership_boundaries", label: "Leadership & Boundaries" },
] as const;

export const PROBLEM_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  kitchen_pass:
    "How delays or errors at the pass directly impact FOH service quality and guest experience. This observation is strictly FOH-scoped: it evaluates how the server manages the wait, communicates with the guest, and recovers the experience — not kitchen operations.",
};

export const FOH_IMPACT_DISCLAIMER =
  "FOH Impact Only — This observation reflects floor-level consequences, not kitchen management.";

export const isFohImpactCategory = (value?: string | null) =>
  value === "kitchen_pass";

export const DIAGNOSIS_TYPES = [
  { value: "structure", label: "Structural" },
  { value: "emotion", label: "Emotional" },
  { value: "both", label: "Structural + Emotional" },
] as const;

export const BSPS_SOLUTIONS = [
  { value: "BSPS-01", label: "BSPS-01 — Operational Re-Sequencing" },
  { value: "BSPS-02", label: "BSPS-02 — Service Boundary Reset" },
  { value: "BSPS-03", label: "BSPS-03 — Leadership Calibration" },
] as const;

export const CONCEPT_TYPES = [
  { value: "bar_canal", label: "Bar / Canal" },
  { value: "casual_dining", label: "Casual Dining" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "hotel_restaurant", label: "Hotel Restaurant" },
] as const;

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const formatEUR = (n: number) => eur.format(n || 0);

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const formatDate = (d: string | Date) =>
  dateFmt.format(typeof d === "string" ? new Date(d) : d);

export const labelOf = (
  list: ReadonlyArray<{ value: string; label: string }>,
  v: string,
) => list.find((x) => x.value === v)?.label ?? v;

// ───────────────────────── Financial-loss engine ─────────────────────────

export type VenueProfile = {
  concept_type: string | null;
  tables: number | null;
  avg_covers_per_table: number | null;
  avg_check_per_person: number | null;
  cycles_per_shift: number | null;
};

export type VenueEconomics = {
  covers: number;
  revenue_ceiling: number;
  max_total_loss: number;
};

export function isVenueProfileComplete(p: VenueProfile | null | undefined): boolean {
  if (!p) return false;
  return (
    !!p.concept_type &&
    Number(p.tables) > 0 &&
    Number(p.avg_covers_per_table) > 0 &&
    Number(p.avg_check_per_person) > 0 &&
    Number(p.cycles_per_shift) > 0
  );
}

// Concept-specific safety-cap ratios (share of revenue_ceiling)
export const CONCEPT_CAP_RATIO: Record<string, number> = {
  bar_canal: 0.3,
  casual_dining: 0.25,
  fine_dining: 0.2,
  hotel_restaurant: 0.22,
};
export const DEFAULT_CAP_RATIO = 0.25;

export function capRatioForConcept(concept_type: string | null | undefined): number {
  if (!concept_type) return DEFAULT_CAP_RATIO;
  return CONCEPT_CAP_RATIO[concept_type] ?? DEFAULT_CAP_RATIO;
}

export function venueEconomics(p: VenueProfile | null | undefined): VenueEconomics | null {
  if (!isVenueProfileComplete(p)) return null;
  const tables = Number(p!.tables);
  const cpt = Number(p!.avg_covers_per_table);
  const check = Number(p!.avg_check_per_person);
  const cycles = Number(p!.cycles_per_shift);
  const covers = tables * cpt;
  const revenue_ceiling = covers * check * cycles;
  const ratio = capRatioForConcept(p!.concept_type);
  return {
    covers,
    revenue_ceiling,
    max_total_loss: revenue_ceiling * ratio,
  };
}

/**
 * Per-observation loss formula based on problem_category and venue profile.
 * - service_flow / kitchen_pass → upsell loss
 * - billing_checkout            → per-incident (avg_check × 2)
 * - staff_fatigue               → 10% of revenue ceiling
 * - leadership_boundaries       → reputation (avg_check × 5)
 */
export function lossForCategory(
  category: string,
  p: VenueProfile | null | undefined,
): number {
  const econ = venueEconomics(p);
  if (!econ || !p) return 0;
  const check = Number(p.avg_check_per_person);
  switch (category) {
    case "service_flow":
    case "kitchen_pass":
      return econ.covers * (check * 0.15) * 0.3;
    case "billing_checkout":
      return check * 2;
    case "staff_fatigue":
      return econ.revenue_ceiling * 0.1;
    case "leadership_boundaries":
      return check * 5;
    default:
      return 0;
  }
}

/**
 * Apply the 40%-of-ceiling safety cap proportionally across rows.
 * Returns an array of capped losses aligned with the input rows.
 */
export function applySafetyCap(
  rawLosses: number[],
  p: VenueProfile | null | undefined,
): { capped: number[]; total: number; capped_total: number; max_total_loss: number | null } {
  const total = rawLosses.reduce((a, b) => a + (Number(b) || 0), 0);
  const econ = venueEconomics(p);
  if (!econ) {
    return { capped: rawLosses.slice(), total, capped_total: total, max_total_loss: null };
  }
  const max = econ.max_total_loss;
  if (total <= max || total === 0) {
    return { capped: rawLosses.slice(), total, capped_total: total, max_total_loss: max };
  }
  const k = max / total;
  const capped = rawLosses.map((v) => Math.floor((Number(v) || 0) * k));
  let sum = capped.reduce((a, b) => a + b, 0);
  // Correct any 1€ overshoot due to rounding by subtracting from the largest item(s)
  while (sum > max) {
    let maxIdx = 0;
    for (let i = 1; i < capped.length; i++) {
      if (capped[i] > capped[maxIdx]) maxIdx = i;
    }
    capped[maxIdx] -= 1;
    sum -= 1;
  }
  return { capped, total, capped_total: sum, max_total_loss: max };
}
