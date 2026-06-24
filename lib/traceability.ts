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

export interface BatchAnswer {
  id: string;
  value: string | null;
  question: { id: string; type: string; label: string; order_index: number };
}

export interface BatchInfo {
  id: string;
  submitted_by: string;
  submitted_at: string;
  checklist: { name: string; category?: string | null };
  answers: BatchAnswer[];
}

export interface WastageReason {
  reason: string;     // wastage | damaged | expired | other
  grams: number;
  notes: string | null;
}

/** Per-lot mass balance: received = used in production + written off + remaining + unaccounted. */
export interface LotReconciliation {
  lot_id: string;
  ingredient_name: string;
  julian_code: string;
  received_g: number;
  used_g: number;        // consumed across ALL production batches
  written_off_g: number; // wastage / damaged / expired / other
  remaining_g: number;
  unaccounted_g: number; // received − used − written_off − remaining
  reasons: WastageReason[];
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
  reconciliation?: LotReconciliation[]; // per-lot ingredient mass balance
}

/** Functions return either a payload or a human-readable error string. */
type TraceOutcome = { result: TraceResult } | { error: string };

const SUBMISSION_SELECT =
  "id, submitted_by, submitted_at, checklist:checklists(name, category), answers(id, value, question:questions(id, type, label, order_index))";

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

/**
 * Extract {lot_id, amount} pairs from any lot-linked answer value. Handles both
 * ingredient_table (rows[].lots[].weight_g, in grams) and packing_runs (runs with
 * jar/lids lot ids + counts, in units). Primary packaging lots live in the same
 * ingredient_lots table, so the whole trace/recall chain treats them uniformly.
 */
function lotUsesFromAnswer(value: string | null, type: string | undefined): Array<{ lot_id: string; amount: number }> {
  if (!value) return [];
  const out: Array<{ lot_id: string; amount: number }> = [];
  try {
    const parsed = JSON.parse(value);
    if (type === "packing_runs") {
      const runs = Array.isArray(parsed) ? parsed : [];
      for (const run of runs) {
        if (run.jar_lot_id && Number(run.jars_used) > 0) out.push({ lot_id: run.jar_lot_id, amount: Number(run.jars_used) });
        if (run.lids_lot_id && Number(run.lids_count) > 0) out.push({ lot_id: run.lids_lot_id, amount: Number(run.lids_count) });
      }
    } else {
      const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
      for (const row of rows) {
        for (const rl of (row.lots ?? [])) {
          if (rl.lot_id) {
            const g = Number(rl.weight_g);
            out.push({ lot_id: rl.lot_id, amount: Number.isNaN(g) ? 0 : g });
          }
        }
      }
    }
  } catch {
    /* ignore malformed answer */
  }
  return out;
}

/** Pull the set of lot IDs referenced by a batch's lot-linked answers (ingredients + primary packaging). */
function lotIdsFromBatches(batches: BatchInfo[]): Set<string> {
  const lotIds = new Set<string>();
  for (const batch of batches) {
    for (const ans of batch.answers ?? []) {
      if (ans.question?.type !== "ingredient_table" && ans.question?.type !== "packing_runs") continue;
      for (const use of lotUsesFromAnswer(ans.value, ans.question?.type)) lotIds.add(use.lot_id);
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

/**
 * Every lot-linked answer (ingredient_table + packing_runs) for the caller's org,
 * paginating past the 1000-row PostgREST cap. Without this, orgs with >1000 answers
 * silently miss production usage recorded in the later rows — corrupting both the
 * trace and the mass balance.
 */
async function fetchLotLinkedAnswers(): Promise<Array<{ submission_id: string; value: string | null; type: string | undefined }>> {
  const all: Array<{ submission_id: string; value: string | null; type: string | undefined }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("answers")
      .select("submission_id, value, question:questions(type)")
      .in("questions.type", ["ingredient_table", "packing_runs"])
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as unknown as Array<{ submission_id: string; value: string | null; question: { type: string } | null }>;
    all.push(...rows.map((r) => ({ submission_id: r.submission_id, value: r.value, type: r.question?.type })));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

/** Find which production submissions consumed a given set of lot IDs. */
async function submissionsUsingLots(lotIds: string[]): Promise<string[]> {
  const answers = await fetchLotLinkedAnswers();
  const wanted = new Set(lotIds);

  const matched = new Set<string>();
  for (const ans of answers ?? []) {
    for (const use of lotUsesFromAnswer(ans.value, ans.type)) {
      if (wanted.has(use.lot_id)) matched.add(ans.submission_id);
    }
  }
  return Array.from(matched);
}

/** Total amount of each lot consumed across ALL production batches (grams for ingredients, units for packaging). */
async function fetchLotUsage(lotIds: string[]): Promise<Record<string, number>> {
  const usage: Record<string, number> = {};
  if (lotIds.length === 0) return usage;
  const wanted = new Set(lotIds);

  const answers = await fetchLotLinkedAnswers();

  for (const ans of answers ?? []) {
    for (const use of lotUsesFromAnswer(ans.value, ans.type)) {
      if (wanted.has(use.lot_id)) usage[use.lot_id] = (usage[use.lot_id] ?? 0) + use.amount;
    }
  }
  return usage;
}

/** Wastage / write-offs per lot, grouped with their reasons. */
async function fetchWastage(lotIds: string[]): Promise<Record<string, WastageReason[]>> {
  const byLot: Record<string, WastageReason[]> = {};
  if (lotIds.length === 0) return byLot;

  const { data } = await supabase
    .from("wastage_log")
    .select("lot_id, quantity_written_off_g, reason, notes")
    .in("lot_id", lotIds);

  for (const w of (data ?? []) as Array<{ lot_id: string; quantity_written_off_g: number; reason: string; notes: string | null }>) {
    if (!w.lot_id) continue;
    (byLot[w.lot_id] ??= []).push({ reason: w.reason, grams: Number(w.quantity_written_off_g) || 0, notes: w.notes });
  }
  return byLot;
}

/**
 * Attach a per-lot ingredient mass balance to a trace result so an auditor can
 * see exactly where every gram of each raw-material lot went, with reasons for
 * any write-offs and a flag for anything unaccounted for.
 */
async function withReconciliation(result: TraceResult): Promise<TraceResult> {
  const lotIds = result.lots.map((l) => l.id);
  const [usage, wastage] = await Promise.all([fetchLotUsage(lotIds), fetchWastage(lotIds)]);

  result.reconciliation = result.lots.map((lot) => {
    const used = usage[lot.id] ?? 0;
    const reasons = wastage[lot.id] ?? [];
    const writtenOff = reasons.reduce((s, r) => s + r.grams, 0);
    const received = lot.quantity_received_g ?? 0;
    const remaining = lot.quantity_remaining_g ?? 0;
    return {
      lot_id: lot.id,
      ingredient_name: lot.ingredient?.name ?? "",
      julian_code: lot.julian_code,
      received_g: received,
      used_g: used,
      written_off_g: writtenOff,
      remaining_g: remaining,
      unaccounted_g: received - used - writtenOff - remaining,
      reasons,
    };
  });
  return result;
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

  return { result: await withReconciliation({ searchType: "lot", query: julianCode, lots: lots as LotInfo[], batches, dispatches }) };
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

  return { result: await withReconciliation({ searchType: "batch", query: julianCode, lots, batches, dispatches }) };
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
    result: await withReconciliation({
      searchType: "ingredient",
      query: lot.ingredient?.name ?? lot.julian_code,
      lots: [lot],
      batches,
      dispatches,
    }),
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

  return { result: await withReconciliation({ searchType: "product", query: name, lots, batches, dispatches }) };
}
