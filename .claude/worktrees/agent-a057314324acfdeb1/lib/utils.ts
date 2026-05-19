import { clsx, type ClassValue } from "clsx";
import type { ChecklistFrequency } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function frequencyLabel(f: ChecklistFrequency): string {
  const labels: Record<ChecklistFrequency, string> = {
    per_shift_am: "Per shift (AM)",
    per_shift_pm: "Per shift (PM)",
    per_delivery: "Per delivery",
    per_dispatch: "Per dispatch",
    per_shift_eod: "End of day",
    weekly: "Weekly",
    monthly: "Monthly",
    adhoc: "Adhoc",
    per_new_start: "Per new start",
    per_complaint: "Per complaint",
    per_corrective_action: "Per corrective action",
    per_batch: "Per batch",
  };
  return labels[f] ?? f;
}

export function frequencyBadgeColor(f: ChecklistFrequency): string {
  if (["per_shift_am", "per_shift_pm", "per_shift_eod"].includes(f)) return "bg-red-100 text-red-700";
  if (f === "weekly") return "bg-blue-100 text-blue-700";
  if (f === "monthly") return "bg-amber-100 text-amber-700";
  if (f === "per_batch") return "bg-orange-100 text-orange-700";
  if (["per_delivery", "per_dispatch"].includes(f)) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-600";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Returns today's Julian code in YYDDD format, e.g. "26136" for May 16 2026 */
export function todayJulianCode(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  const yy = String(now.getFullYear()).slice(-2);
  return `${yy}${String(dayOfYear).padStart(3, "0")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
