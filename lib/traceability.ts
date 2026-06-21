import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Shared traceability engine.
//
// The full chain is:  Customer ⇽ Dispatch ⇽ Production batch ⇽ Ingredient lots ⇽ Suppliers
// These functions walk that chain in either direction and are reused by both the
// Traceability search page and the Mock Recall flow.
//
// RLS (get_my_org_id) scopes every query to the caller's organisation, so no
// explicit organisation_id filter is needed here.
// ─────────────────────────────────────────────────────────────────────────────

export interface LotInfo {
  id: string;
  julian_code: string;
  quantity_received_g: number;
  quantity_remaining_g: number;
  received_date: string;
  supplier: string | null;
  best_before_date: string | null;
  created_by: string;
  ingredient: { name: string };
}

export interface BatchInfo {
  id: string;
  submitted_by: string;
  submitted_at: string;
  checklist: { name: string };
  answers: Array<{ value: string | null; question: { type: string; label: string } }>;
}

export interface DispatchInfo {
  id: string;
  dispatch_date: string;
  product: string;
  customer: string;
  cases_of_6: number;
  cases_of_3: number;
  singles: number;
  total_units: number;
  reference: string | null;
  dispatched_by: string;
  notes: string | null;
  batch_submission_id: string | null;
}

export interface TraceResult {
  searchType: "lot" | "batch" | "ingredient" | "product";
  query: string;
  lots: LotInfo[];
  batches: BatchInfo[];
  dispatches: DispatchInfo[];
}

/** Functions return either a payload or a human-readable error string. */
type TraceOutcome = { result: TraceResult } | { error: string };

const SUBMISSION_SELECT =
  "id, submitted_by, submitted_at, checklist:checklists(name), answers(value, question:questions(type, label))";

/** Extract the batch/Julian code from a batch submission's answers (text questions only). */
export function getBatchCode(batch: BatchInfo): string {
  for (const ans of batch.answers ?? []) {
    if (!ans.value) continue;
    const label = (ans.question?.label ?? "").toLowerCase();
    const type = ans.question?.type ?? "";
    if (
      type === "text" &&
      (label.includes("julian") || label.includes("batch code") || label.includes("lot number") || label.includes("batch ref"))
    ) {
      return ans.value;
    }
  }
  return "";
}

export interface MassBalance {
  produced: number;    // total finished units produced across the traced batches
  dispatched: number;  // total units dispatched
  remaining: number;   // produced − dispatched
  reconciled: boolean;  // true when dispatched does not exceed produced
}

/**
 * Units produced from a batch submission. Per the data conventions we prefer an
 * explicit "Total units produced" answer; numeric/text answers are parsed loosely.
 */
export function getUnitsProduced(batch: BatchInfo): number {
  for (const ans of batch.answers ?? []) {
    if (!ans.value) continue;
    const label = (ans.question?.label ?? "").toLowerCase();
    if (label.includes("units produced") || label.includes("total units")) {
      const n = parseInt(ans.value.replace(/[^0-9]/g, ""), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/** Reconcile produced vs dispatched units for a mock-recall mass-balance check. */
export function computeMassBalance(result: TraceResult): MassBalance {
  const produced = result.batches.reduce((s, b) => s + getUnitsProduced(b), 0);
  const dispatched = result.dispatches.reduce((s, d) => s + (d.total_units ?? 0), 0);
  return {
    produced,
    dispatched,
    remaining: produced - dispatched,
    reconciled: produced === 0 ? false : dispatched <= produced,
  };
}

/** Pull the set of ingredient-lot IDs referenced by a batch's ingredient_table answers. */
function lotIdsFromBatches(batches: BatchInfo[]): Set<string> {
  const lotIds = new Set<string>();
  for (const batch of batches) {
    for (const ans of batch.answers ?? []) {
      if (!ans.value || ans.question?.type !== "ingredient_table") continue;
      try {
        const parsed = JSON.parse(ans.value);
        const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
        for (const row of rows) {
          for (const rl of (row.lots ?? [])) {
            if (rl.lot_id) lotIds.add(rl.lot_id);
          }
        }
      } catch {
        /* ignore malformed answer */
      }
    }
  }
  return lotIds;
}

async function fetchBatches(submissionIds: string[]): Promise<BatchInfo[]> {
  if (submissionIds.length === 0) return [];
  const { data } = await supabase.from("submissions").select(SUBMISSION_SELECT).in("id", submissionIds);
  return (data ?? []) as unknown as BatchInfo[];
}

async function fetchDispatchesForBatches(submissionIds: string[]): Promise<DispatchInfo[]> {
  if (submissionIds.length === 0) return [];
  const { data } = await supabase.from("dispatches").select("*").in("batch_submission_id", submissionIds);
  return (data ?? []) as DispatchInfo[];
}

async function fetchLots(lotIds: string[]): Promise<LotInfo[]> {
  if (lotIds.length === 0) return [];
  const { data } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name)")
    .in("id", lotIds);
  return (data ?? []) as LotInfo[];
}

/** Find which production submissions consumed a given set of lot IDs. */
async function submissionsUsingLots(lotIds: string[]): Promise<string[]> {
  const { data: answers } = await supabase
    .from("answers")
    .select("submission_id, value, question:questions(type)")
    .eq("questions.type", "ingredient_table");

  const matched = new Set<string>();
  for (const ans of answers ?? []) {
    if (!ans.value) continue;
    try {
      const parsed = JSON.parse(ans.value);
      const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
      for (const row of rows) {
        for (const rl of (row.lots ?? [])) {
          if (rl.lot_id && lotIds.includes(rl.lot_id)) matched.add(ans.submission_id);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return Array.from(matched);
}

// ── Search by raw-material Julian code ──────────────────────────────────────
export async function searchByLot(julianCode: string): Promise<TraceOutcome> {
  const { data: lots } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name)")
    .ilike("julian_code", `%${julianCode}%`);

  if (!lots || lots.length === 0) {
    return { error: `No ingredient lots found with Julian code matching "${julianCode}".` };
  }

  const submissionIds = await submissionsUsingLots(lots.map((l: LotInfo) => l.id));
  const batches = await fetchBatches(submissionIds);
  const dispatches = await fetchDispatchesForBatches(submissionIds);

  return { result: { searchType: "lot", query: julianCode, lots: lots as LotInfo[], batches, dispatches } };
}

// ── Search by finished-product Julian / batch code ──────────────────────────
export async function searchByBatch(julianCode: string): Promise<TraceOutcome> {
  const { data: matchingAnswers } = await supabase
    .from("answers")
    .select("submission_id, value, question:questions(label)")
    .ilike("value", `%${julianCode}%`);

  const submissionIds = [
    ...new Set(
      (matchingAnswers ?? [])
        .filter((a) => {
          const label = (a.question as unknown as { label: string })?.label?.toLowerCase() ?? "";
          return label.includes("batch") || label.includes("julian");
        })
        .map((a) => a.submission_id)
    ),
  ];

  if (submissionIds.length === 0) {
    return { error: `No batch records found for Julian code "${julianCode}".` };
  }

  const batches = await fetchBatches(submissionIds);
  if (batches.length === 0) {
    return { error: `No batch records found for Julian code "${julianCode}".` };
  }

  const lots = await fetchLots(Array.from(lotIdsFromBatches(batches)));
  const dispatches = await fetchDispatchesForBatches(submissionIds);

  return { result: { searchType: "batch", query: julianCode, lots, batches, dispatches } };
}

// ── Search by ingredient name — step 1: list candidate lots ─────────────────
export async function searchIngredientLots(name: string): Promise<{ lots: LotInfo[] } | { error: string }> {
  const { data: ingredients } = await supabase.from("ingredients").select("id, name").ilike("name", `%${name}%`);

  if (!ingredients || ingredients.length === 0) {
    return { error: `No ingredients found matching "${name}".` };
  }

  const { data: lots } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name)")
    .in("ingredient_id", ingredients.map((i: { id: string }) => i.id))
    .order("received_date", { ascending: false });

  if (!lots || lots.length === 0) {
    return { error: `No goods-in records found for "${name}".` };
  }

  return { lots: lots as LotInfo[] };
}

// ── Ingredient name — step 2: trace forward from one chosen lot ──────────────
export async function traceFromLot(lot: LotInfo): Promise<TraceOutcome> {
  const submissionIds = await submissionsUsingLots([lot.id]);
  const batches = await fetchBatches(submissionIds);
  const dispatches = await fetchDispatchesForBatches(submissionIds);

  return {
    result: {
      searchType: "ingredient",
      query: lot.ingredient?.name ?? lot.julian_code,
      lots: [lot],
      batches,
      dispatches,
    },
  };
}

// ── Search by finished-product name (backward trace) ────────────────────────
export async function searchByProduct(name: string): Promise<TraceOutcome> {
  // 1. Dispatches matching this product name
  const { data: disps } = await supabase
    .from("dispatches")
    .select("*")
    .ilike("product", `%${name}%`)
    .order("dispatch_date", { ascending: false });
  const dispatches = (disps ?? []) as DispatchInfo[];

  // 2a. Batch submissions linked to those dispatches
  const linkedBatchIds = [
    ...new Set((disps ?? []).map((d: { batch_submission_id?: string }) => d.batch_submission_id).filter(Boolean)),
  ] as string[];

  // 2b. Also production submissions matched directly by checklist name
  //     (catches batches not yet dispatched or dispatched without a batch link)
  const { data: directSubs } = await supabase
    .from("submissions")
    .select("id, checklist:checklists(name, category)")
    .order("submitted_at", { ascending: false });

  const directBatchIds = (directSubs ?? [])
    .filter((s: any) => {
      const clName: string = s.checklist?.name ?? "";
      const clCat: string = s.checklist?.category ?? "";
      return clCat === "Production" && clName.toLowerCase().includes(name.toLowerCase());
    })
    .map((s: any) => s.id as string);

  const allBatchIds = [...new Set([...linkedBatchIds, ...directBatchIds])];
  const batches = await fetchBatches(allBatchIds);

  if (dispatches.length === 0 && batches.length === 0) {
    return { error: `No records found for product matching "${name}".` };
  }

  const lots = await fetchLots(Array.from(lotIdsFromBatches(batches)));

  return { result: { searchType: "product", query: name, lots, batches, dispatches } };
}
