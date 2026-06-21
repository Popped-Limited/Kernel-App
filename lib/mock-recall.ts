import type { TraceResult, MassBalance } from "@/lib/traceability";

export type RecallDirection = "forward" | "backward";
export type RecallOutcome = "pass" | "pass_with_actions" | "fail";

export interface CustomerContact {
  customer: string;
  contacted_by?: string;
  response?: string;
}

/** Light row used by the list page. */
export interface MockRecallRow {
  id: string;
  direction: RecallDirection;
  trigger_type: "ingredient_lot" | "finished_product";
  trigger_label: string;
  outcome: RecallOutcome | null;
  time_started: string | null;
  time_completed: string | null;
  conducted_by: string;
  created_at: string;
}

/** Full record used by the report page. */
export interface MockRecall extends MockRecallRow {
  trace_snapshot: TraceResult;
  mass_balance: MassBalance;
  findings: string | null;
  corrective_actions: string | null;
  customers_contacted: CustomerContact[];
  signed_off_by: string | null;
}

/** "42 min" / "1 h 5 min" between start and completion, or "—". */
export function recallDurationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function outcomeBadge(outcome: RecallOutcome | null): { label: string; className: string } {
  switch (outcome) {
    case "pass":
      return { label: "Pass", className: "bg-green-100 text-green-700" };
    case "pass_with_actions":
      return { label: "Pass with actions", className: "bg-amber-100 text-amber-700" };
    case "fail":
      return { label: "Fail", className: "bg-red-100 text-red-700" };
    default:
      return { label: "—", className: "bg-gray-100 text-gray-500" };
  }
}
