import { supabase } from "@/lib/supabase";

// GMP audits (SALSA issue 7): monthly, one area per audit, rotating so every
// area gets covered. Free-form findings with photos, a risk rating and an
// assignee who closes the finding out with evidence.

export type GmpRisk = "high" | "medium" | "low";

export interface GmpArea {
  id: string;
  organisation_id: string;
  name: string;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface GmpAudit {
  id: string;
  organisation_id: string;
  area_id: string;
  audit_date: string;
  auditor_name: string;
  auditor_user: string | null;
  notes: string | null;
  status: "in_progress" | "completed";
  completed_at: string | null;
  created_at: string;
  gmp_areas?: { name: string } | null; // joined
}

export interface GmpFinding {
  id: string;
  organisation_id: string;
  audit_id: string;
  description: string;
  action_plan: string | null;
  risk: GmpRisk;
  photos: string[];
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  status: "open" | "closed";
  close_note: string | null;
  close_photos: string[];
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  gmp_audits?: { audit_date: string; area_id: string; gmp_areas?: { name: string } | null } | null; // joined
}

// SALSA-shaped starting point, seeded per org on first visit. Placeholder set
// pending Katie's confirmation — orgs can rename/add/remove in-app, so the
// exact wording here is not load-bearing.
export const DEFAULT_GMP_AREAS = [
  "Fabrication & maintenance",
  "Cleaning & hygiene",
  "Pest control",
  "Storage areas",
  "Production & equipment",
  "Personnel & changing facilities",
  "Waste management",
  "External areas & site security",
];

// Auto due date from risk, editable at assignment.
export const RISK_DUE_DAYS: Record<GmpRisk, number> = { high: 7, medium: 30, low: 90 };

export const RISK_LABEL: Record<GmpRisk, string> = { high: "High", medium: "Medium", low: "Low" };

export const RISK_CHIP: Record<GmpRisk, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-green-100 text-green-700",
};

// Local YYYY-MM-DD (not toISOString — that flips date around midnight UK time)
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dueDateForRisk(risk: GmpRisk, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + RISK_DUE_DAYS[risk]);
  return localDateStr(d);
}

export function isOverdue(f: Pick<GmpFinding, "status" | "due_date">): boolean {
  return f.status === "open" && !!f.due_date && f.due_date < localDateStr();
}

// Audits are monthly: next due = 1 month after the last completed audit.
export function nextAuditDue(lastCompletedDate: string | null): string | null {
  if (!lastCompletedDate) return null; // never audited — "due now"
  const d = new Date(lastCompletedDate + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  return localDateStr(d);
}

/**
 * Uploads a GMP photo to the existing public compliance-photos bucket and
 * returns its public URL. Throws on failure — callers must surface the error,
 * never save a finding that silently lost its photo evidence.
 */
export async function uploadGmpPhoto(file: File, orgId: string, auditId: string): Promise<string> {
  const ext = (file.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
  const path = `gmp/${orgId}/${auditId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await supabase.storage
    .from("compliance-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error || !data) throw new Error("photo-upload-failed");
  return supabase.storage.from("compliance-photos").getPublicUrl(path).data.publicUrl;
}
