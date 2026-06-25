// ─────────────────────────────────────────────────────────────────────────────
// SALSA supplier risk-assessment model — single source of truth.
// Scoring factors, banding thresholds, the supplier-risk grid and the
// review-frequency matrix are all transcribed verbatim from the SALSA
// "Supplier Approval Matrix" document. Imported by the risk calculator,
// the matrix viewer, and the suppliers page so they can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

export type Risk = "low" | "medium" | "high";

export interface ScoreOption { label: string; value: number }
export interface ScoreQuestion { id: string; label: string; options: ScoreOption[] }

export const RAW_MATERIAL_QUESTIONS: ScoreQuestion[] = [
  {
    id: "temperature",
    label: "Temperature / storage condition",
    options: [
      { label: "Ambient", value: 1 },
      { label: "Frozen", value: 2 },
      { label: "Chilled", value: 3 },
    ],
  },
  {
    id: "packaging",
    label: "How is the raw material packaged on delivery?",
    options: [
      { label: "Enclosed / sealed", value: 1 },
      { label: "Open / unsealed", value: 3 },
    ],
  },
  {
    id: "ips",
    label: "Identity Preserved Status – end product legal declaration",
    options: [
      { label: "No legal declaration (standard product)", value: 1 },
      { label: "Legal declaration present (e.g. Gluten Free, RSPO, Free Range)", value: 3 },
    ],
  },
  {
    id: "micro_results",
    label: "Historic microbiological test results",
    options: [
      { label: "Within target", value: 1 },
      { label: "Acceptable", value: 2 },
      { label: "Unsatisfactory", value: 3 },
    ],
  },
  {
    id: "quality",
    label: "Historic quality of supply",
    options: [
      { label: "Good", value: 1 },
      { label: "Fair", value: 2 },
      { label: "Poor", value: 3 },
    ],
  },
  {
    id: "allergen",
    label: "Allergen risk of the raw material",
    options: [
      { label: "Low – allergen absent from raw material", value: 1 },
      { label: "Medium – may contain allergens", value: 2 },
      { label: "High – allergen present in raw material", value: 3 },
    ],
  },
  {
    id: "foreign_body",
    label: "Foreign body risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
  {
    id: "micro_risk",
    label: "Microbiological contamination risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
  {
    id: "chemical",
    label: "Chemical contamination risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
];

export const PACKAGING_QUESTIONS: ScoreQuestion[] = [
  {
    id: "pkg_type",
    label: "Type of packaging",
    options: [
      { label: "Secondary – non-food contact (e.g. outer case)", value: 1 },
      { label: "Primary – unprinted, food contact (e.g. plain jars / lids)", value: 2 },
      { label: "Primary – printed, food contact (e.g. labels, printed film)", value: 3 },
    ],
  },
  {
    id: "mandatory_info",
    label: "Does the packaging carry mandatory information that could cause illness if incorrect? (e.g. allergens, cooking instructions)",
    options: [
      { label: "None – no mandatory safety information", value: 1 },
      { label: "Present – carries mandatory safety information", value: 3 },
    ],
  },
  {
    id: "quality",
    label: "Historic quality of supply",
    options: [
      { label: "Good", value: 1 },
      { label: "Fair", value: 2 },
      { label: "Poor or new supplier", value: 3 },
    ],
  },
];

export type MaterialType = "raw_material" | "packaging";

// Banding thresholds for the summed material score. SALSA:
//   raw material: <10 Low · 10–15 Medium · >15 High
//   packaging:    <6  Low · 6–7   Medium · >7  High
export const MATERIAL_THRESHOLDS: Record<MaterialType, { lowMax: number; mediumMax: number }> = {
  // lowMax = highest total still Low; mediumMax = highest total still Medium.
  raw_material: { lowMax: 9, mediumMax: 15 },
  packaging:    { lowMax: 5, mediumMax: 7 },
};

export const THRESHOLD_LABELS: Record<MaterialType, string> = {
  raw_material: "< 10 = Low  ·  10–15 = Medium  ·  > 15 = High",
  packaging:    "< 6 = Low  ·  6–7 = Medium  ·  > 7 = High",
};

export function materialQuestions(type: MaterialType): ScoreQuestion[] {
  return type === "raw_material" ? RAW_MATERIAL_QUESTIONS : PACKAGING_QUESTIONS;
}

export function materialTotal(scores: Record<string, number>, type: MaterialType): number {
  return materialQuestions(type).reduce((sum, q) => sum + (scores[q.id] ?? 0), 0);
}

/** Banded material risk, or null if not every factor has been answered. */
export function calcMaterialRisk(scores: Record<string, number>, type: MaterialType): Risk | null {
  const questions = materialQuestions(type);
  const answered = questions.filter(q => scores[q.id] !== undefined).length;
  if (answered < questions.length) return null;
  const total = materialTotal(scores, type);
  const { lowMax, mediumMax } = MATERIAL_THRESHOLDS[type];
  if (total <= lowMax) return "low";
  if (total <= mediumMax) return "medium";
  return "high";
}

// Supplier risk grid (SALSA): SAQ × Accreditation/Hygiene rating.
//   SAQ ✓ + Cert ✓ = Low · exactly one = Medium · neither = High
export function calcSupplierRisk(saqCompleted: boolean, hasValidCert: boolean): Risk {
  if (saqCompleted && hasValidCert) return "low";
  if (saqCompleted || hasValidCert) return "medium";
  return "high";
}

// Review-frequency matrix — verbatim from the SALSA document.
// Indexed [materialRisk][supplierRisk]; values are years between reviews.
export const REVIEW_FREQUENCY_MATRIX: Record<Risk, Record<Risk, number>> = {
  low:    { low: 3, medium: 3, high: 2 },
  medium: { low: 3, medium: 2, high: 1 },
  high:   { low: 2, medium: 2, high: 1 },
};

export function calcReviewFrequency(supplierRisk: Risk, materialRisk: Risk): number {
  return REVIEW_FREQUENCY_MATRIX[materialRisk][supplierRisk];
}

/** ISO date (yyyy-mm-dd) `years` from `from` (defaults to today). */
export function reviewDueDate(years: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

/** A certificate counts only if it exists and has not expired. */
export function certIsValid(hasCertDoc: boolean, certExpiry: string | null): boolean {
  if (!hasCertDoc) return false;
  if (!certExpiry) return true; // uploaded cert with no recorded expiry — treat as valid
  const expiry = new Date(certExpiry);
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry.getTime() >= today.getTime();
}

export const RISK_STYLES: Record<Risk, { bg: string; text: string; label: string }> = {
  low:    { bg: "bg-brand/30",  text: "text-brown",     label: "Low" },
  medium: { bg: "bg-amber-100", text: "text-amber-800", label: "Medium" },
  high:   { bg: "bg-red-100",   text: "text-red-800",   label: "High" },
};

// Snapshot persisted to suppliers.risk_assessment_data for audit "show the working".
export interface RiskAssessmentData {
  material_type: MaterialType;
  material_scores: Record<string, number>;
  material_total: number;
  material_band: Risk;
  saq_completed: boolean;
  has_valid_cert: boolean;
  supplier_risk: Risk;
  review_frequency_years: number;
  assessed_at: string; // ISO date
}
