export const CONSULTANT_NAME = "Alexandros Chatziliadis";
export const APP_NAME = "HCT";
export const APP_LONG_NAME = "Hospitality Diagnostic Tool";

export const SHIFTS = [
  { value: "morgen", label: "Morgen-Schicht" },
  { value: "abend", label: "Abend-Schicht" },
] as const;

export const PROBLEM_CATEGORIES = [
  { value: "kitchen_pass", label: "Kitchen & Pass Coordination" },
  { value: "billing_checkout", label: "Billing & Checkout" },
  { value: "service_flow", label: "Service Flow" },
  { value: "staff_fatigue", label: "Staff Fatigue & Morale" },
  { value: "leadership_boundaries", label: "Leadership & Boundaries" },
] as const;

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
