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

export const OBSERVATION_TYPES = [
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive" },
  { value: "emotional", label: "Emotional" },
  { value: "opportunity", label: "Opportunity" },
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number]["value"];

export const EXPERIENCE_IMPACTS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;
export type ExperienceImpact = (typeof EXPERIENCE_IMPACTS)[number]["value"];

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
 * Per-observation loss formula. The dominant signal is the explicit
 * `is_walkout` flag: only when the consultant marks an observation as a real
 * customer walk-out do we apply the full per-cover check. Without that flag,
 * the same affected_covers represent a degraded — but still served —
 * experience, and the formula uses a small percentage of the check.
 *
 *   WALK-OUT (is_walkout = true, any category):
 *     loss = affected_covers × check × 1.00
 *
 *   NON-WALK-OUT (delay / degradation only):
 *     service_flow          → ac × check × 0.12 + dm × check × 0.02
 *     leadership_boundaries → ac × check × 0.10
 *     kitchen_pass          → ac × check × 0.10 + dm × check × 0.02
 *     billing_checkout      → ac × check × 0.10
 *     staff_fatigue         → ac × check × 0.10 + dm × check × 0.05
 *
 * Defaults: delay_minutes = 5, affected_covers = 4. Data-driven; not keyed
 * off the revenue ceiling, so values can never drift toward the cap by design.
 */
export type ObservationMetrics = {
  delay_minutes?: number | null;
  affected_covers?: number | null;
  is_walkout?: boolean | null;
};

export const DEFAULT_OBS_METRICS = {
  delay_minutes: 10,
  affected_covers: 6,
  is_walkout: false,
} as const;

export function lossForCategory(
  category: string,
  p: VenueProfile | null | undefined,
  metrics?: ObservationMetrics,
): number {
  const econ = venueEconomics(p);
  if (!econ || !p) return 0;
  const check = Number(p.avg_check_per_person);
  const dm = Math.max(0, Number(metrics?.delay_minutes ?? DEFAULT_OBS_METRICS.delay_minutes));
  const ac = Math.max(0, Number(metrics?.affected_covers ?? DEFAULT_OBS_METRICS.affected_covers));
  const walkout = Boolean(metrics?.is_walkout);
  if (walkout) return ac * check * 1.0;
  switch (category) {
    case "service_flow":
      return ac * check * 0.12 + dm * check * 0.02;
    case "leadership_boundaries":
      return ac * check * 0.1;
    case "kitchen_pass":
      return ac * check * 0.1 + dm * check * 0.02;
    case "billing_checkout":
      return ac * check * 0.1;
    case "staff_fatigue":
      return ac * check * 0.1 + dm * check * 0.05;
    default:
      return 0;
  }
}


// ───────────────────────── Severity scoring ─────────────────────────

export type SeverityLevel = "good" | "moderate" | "critical";

export type SeverityScore = {
  level: SeverityLevel;
  label: string;
  loss_pct_of_ceiling: number; // 0..100
  positive_ratio: number;       // 0..1
  total_observations: number;
  positive_observations: number;
  negative_observations: number;
  emotional_observations: number;
};

const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  good: "Good",
  moderate: "Moderate",
  critical: "Critical",
};

/**
 * Overall venue severity, used by Chief Diagnosis to calibrate tone and shown
 * in the Executive Summary.
 *
 *   - critical : loss ≥ 60% of max cap OR ≥ 70% of findings negative AND ≥ 5 negatives
 *   - good     : loss ≤ 20% of max cap AND positive_ratio ≥ 50%
 *   - moderate : everything else
 */
export function computeSeverity(
  audits: ReadonlyArray<{ is_positive?: boolean | null; observation_type?: string | null }>,
  totalCappedLoss: number,
  econ: VenueEconomics | null | undefined,
): SeverityScore {
  const total = audits.length;
  const positive = audits.filter((a) => {
    const t = a.observation_type ?? (a.is_positive ? "positive" : "negative");
    return t === "positive";
  }).length;
  const emotional = audits.filter((a) => {
    const t = a.observation_type ?? (a.is_positive ? "positive" : "negative");
    return t === "emotional";
  }).length;
  const negative = total - positive - emotional;
  const positive_ratio = total > 0 ? (positive + emotional * 0.5) / total : 0;
  const ceiling = econ?.max_total_loss ?? 0;
  const loss_pct_of_ceiling = ceiling > 0 ? Math.min(100, (totalCappedLoss / ceiling) * 100) : 0;

  let level: SeverityLevel = "moderate";
  if (
    loss_pct_of_ceiling >= 60 ||
    (negative >= 5 && positive_ratio <= 0.3)
  ) {
    level = "critical";
  } else if (loss_pct_of_ceiling <= 20 && positive_ratio >= 0.5) {
    level = "good";
  } else if (total === 0) {
    level = "good";
  }

  return {
    level,
    label: SEVERITY_LABEL[level],
    loss_pct_of_ceiling,
    positive_ratio,
    total_observations: total,
    positive_observations: positive,
    negative_observations: negative,
    emotional_observations: emotional,
  };
}

export const POSITIVE_REINFORCEMENT_STEPS = [
  "Καταγράψτε αναλυτικά τα βήματα και τις συμπεριφορές της ομάδας που οδήγησαν στο θετικό αποτέλεσμα, ώστε να αποτυπωθούν ως πρότυπο καλής πρακτικής.",
  "Επιβραβεύστε δημόσια τα μέλη της ομάδας που συνέβαλαν σε αυτή την εμπειρία, στο επόμενο pre-shift briefing.",
  "Χρησιμοποιήστε την παρατήρηση ως εκπαιδευτικό case study στην επόμενη εσωτερική συνάντηση της ομάδας FOH.",
] as const;

export const POSITIVE_REINFORCEMENT_TEXT = POSITIVE_REINFORCEMENT_STEPS
  .map((s, i) => `${i + 1}. ${s}`)
  .join("\n");

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
