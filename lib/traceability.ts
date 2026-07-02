import { supabase } from "@/lib/supabase";
import { expandRunValues } from "@/lib/production-runs";
import { fetchAll } from "@/lib/fetchAll";

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
  ingredient: { name: string; unit?: string | null };
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
  unit: string;          // "g" (weighed ingredient) or "units" (e.g. packaging)
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

export interface ReturnInfo {
  id: string;
  return_date: string;
  product: string;
  customer: string;
  quantity: number;
  returned_by: string;
  notes: string | null;
  dispatch_id: string | null;
  batch_submission_id: string | null;
}

/** A finished-goods stock adjustment (sample, wastage, count correction) tagged to a batch code. */
export interface AdjustmentInfo {
  id: string;
  product: string;
  quantity: number; // signed — samples/wastage negative
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  batch_code: string | null;
}

export interface TraceResult {
  searchType: "lot" | "batch" | "ingredient" | "product";
  query: string;
  product?: string; // finished-product name when the trace is product/batch-scoped
  lots: LotInfo[];
  batches: BatchInfo[];
  dispatches: DispatchInfo[];
  returns: ReturnInfo[];
  reconciliation?: LotReconciliation[]; // per-lot ingredient mass balance
  adjustments?: AdjustmentInfo[]; // finished-goods adjustments against the traced batch codes
  // Dispatches of the same product with NO batch link — they can't be ruled in
  // or out of a recall, so every trace must surface them as a traceability gap.
  unlinked_dispatches?: DispatchInfo[];
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
  returned: number;    // total units returned to stock
  adjusted: number;    // signed batch-tagged finished-goods adjustments (samples/wastage negative)
  remaining: number;   // produced + adjusted − (dispatched − returned)
  reconciled: boolean;  // true when net dispatched does not exceed produced + adjusted
}

/**
 * Units produced from a batch submission. Per the data conventions we prefer an
 * explicit "Total units produced" answer and only fall back to the packing log's
 * jars_used when it's absent — tracked in separate accumulators so answer order
 * can't make the fallback win.
 */
export function getUnitsProduced(batch: BatchInfo): number {
  let explicit = 0;
  let jarsFallback = 0;
  for (const ans of batch.answers ?? []) {
    if (!ans.value) continue;
    const label = (ans.question?.label ?? "").toLowerCase();
    const type = ans.question?.type ?? "";
    if (label.includes("units produced") || label.includes("total units")) {
      const n = parseInt(ans.value.replace(/[^0-9]/g, ""), 10);
      if (!Number.isNaN(n)) explicit += n;
    }
    if (type === "packing_runs") {
      for (const v of expandRunValues(ans.value)) {
        try {
          const runs = JSON.parse(v);
          if (Array.isArray(runs)) for (const r of runs) jarsFallback += Number(r?.jars_used) || 0;
        } catch { /* ignore malformed packing log */ }
      }
    }
  }
  return explicit > 0 ? explicit : jarsFallback;
}

/** Reconcile produced vs net-dispatched units for a mock-recall mass-balance check. */
export function computeMassBalance(result: TraceResult): MassBalance {
  const produced = result.batches.reduce((s, b) => s + getUnitsProduced(b), 0);
  const dispatched = result.dispatches.reduce((s, d) => s + (d.total_units ?? 0), 0);
  const returned = (result.returns ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  const adjusted = (result.adjustments ?? []).reduce((s, a) => s + (a.quantity ?? 0), 0);
  const netDispatched = dispatched - returned;
  return {
    produced,
    dispatched,
    returned,
    adjusted,
    remaining: produced + adjusted - netDispatched,
    reconciled: produced === 0 ? false : netDispatched <= produced + adjusted,
  };
}

/**
 * Extract {lot_id, amount} pairs from any lot-linked answer value. Handles both
 * ingredient_table (rows[].lots[].weight_g, in grams) and packing_runs (runs with
 * jar/lids lot ids + counts, in units). Primary packaging lots live in the same
 * ingredient_lots table, so the whole trace/recall chain treats them uniformly.
 */
function lotUsesFromAnswer(value: string | null, type: string | undefined): Array<{ lot_id: string; amount: number }> {
  const out: Array<{ lot_id: string; amount: number }> = [];
  // A multi-run record wraps each run's value in { __runs__: [...] } — expand so
  // every run's lots are traced, not just the first.
  for (const v of expandRunValues(value)) {
    try {
      const parsed = JSON.parse(v);
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

/** Returns logged against the traced production batches (the "came back" leg of the chain). */
async function fetchReturnsForBatches(submissionIds: string[]): Promise<ReturnInfo[]> {
  if (submissionIds.length === 0) return [];
  const { data } = await supabase.from("goods_returns").select("*").in("batch_submission_id", submissionIds);
  return (data ?? []) as ReturnInfo[];
}

async function fetchLots(lotIds: string[]): Promise<LotInfo[]> {
  if (lotIds.length === 0) return [];
  const { data } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name, unit)")
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
export async function fetchLotUsage(lotIds: string[]): Promise<Record<string, number>> {
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
export async function fetchWastage(lotIds: string[]): Promise<Record<string, WastageReason[]>> {
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
      unit: lot.ingredient?.unit ?? "g",
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

/** "Garlic Chilli Oil — Production Record" → "Garlic Chilli Oil" (same rule as Goods Out). */
export function productNameFromChecklist(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
}

/**
 * Attach finished-goods adjustments (samples/wastage tagged to the traced batch
 * codes) and any dispatches of the same product that were saved WITHOUT a batch
 * link. The unlinked ones are a traceability gap — a recall can't rule them in
 * or out — so every trace and recall must show them rather than hide them.
 */
async function enrich(result: TraceResult): Promise<TraceResult> {
  const codes = [...new Set(result.batches.map(getBatchCode).filter(Boolean))];
  const products = [
    ...new Set(
      [result.product, ...result.batches.map((b) => productNameFromChecklist(b.checklist?.name))]
        .filter((p): p is string => !!p)
    ),
  ];

  const [adjRes, unlinkedRes] = await Promise.all([
    codes.length > 0
      ? supabase.from("finished_goods_adjustments").select("*").in("batch_code", codes)
      : Promise.resolve({ data: [] as AdjustmentInfo[] }),
    products.length > 0
      ? supabase.from("dispatches").select("*").is("batch_submission_id", null).in("product", products)
      : Promise.resolve({ data: [] as DispatchInfo[] }),
  ]);

  result.adjustments = (adjRes.data ?? []) as AdjustmentInfo[];
  result.unlinked_dispatches = (unlinkedRes.data ?? []) as DispatchInfo[];
  return result;
}

/** Supplier contact details for the "contact the suppliers" leg of a recall. */
export interface SupplierContact {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

/** Look up contact details for the suppliers named on a set of lots (case-insensitive exact match). */
export async function fetchSupplierContacts(names: string[]): Promise<SupplierContact[]> {
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const { data } = await supabase.from("suppliers").select("id, name, contact_name, contact_email, contact_phone");
  return ((data ?? []) as SupplierContact[]).filter((s) => wanted.includes(s.name.trim().toLowerCase()));
}

// ── Search by raw-material Julian code ──────────────────────────────────────
export async function searchByLot(julianCode: string): Promise<TraceOutcome> {
  const { data: lots } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name, unit)")
    .ilike("julian_code", `%${julianCode}%`);

  if (!lots || lots.length === 0) {
    return { error: `No ingredient lots found with Julian code matching "${julianCode}".` };
  }

  const submissionIds = await submissionsUsingLots(lots.map((l: LotInfo) => l.id));
  const batches = await fetchBatches(submissionIds);
  const dispatches = await fetchDispatchesForBatches(submissionIds);
  const returns = await fetchReturnsForBatches(submissionIds);

  return { result: await withReconciliation(await enrich({ searchType: "lot", query: julianCode, lots: lots as LotInfo[], batches, dispatches, returns })) };
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
  const returns = await fetchReturnsForBatches(submissionIds);

  return { result: await withReconciliation(await enrich({ searchType: "batch", query: julianCode, lots, batches, dispatches, returns })) };
}

// ── Search by ingredient name — step 1: list candidate lots ─────────────────
export async function searchIngredientLots(name: string): Promise<{ lots: LotInfo[] } | { error: string }> {
  const { data: ingredients } = await supabase.from("ingredients").select("id, name").ilike("name", `%${name}%`);

  if (!ingredients || ingredients.length === 0) {
    return { error: `No ingredients found matching "${name}".` };
  }

  const { data: lots } = await supabase
    .from("ingredient_lots")
    .select("*, ingredient:ingredients(name, unit)")
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
  const returns = await fetchReturnsForBatches(submissionIds);

  return {
    result: await withReconciliation(await enrich({
      searchType: "ingredient",
      query: lot.ingredient?.name ?? lot.julian_code,
      lots: [lot],
      batches,
      dispatches,
      returns,
    })),
  };
}

// ── Backward recall — step 1: list a product's batches to pick from ─────────
/** One recallable batch: a batch code and the production submission(s) behind it. */
export interface ProductBatchGroup {
  product: string;
  batch_code: string; // "" when the record has no batch code answer
  submission_ids: string[];
  first_date: string;
  last_date: string;
  units_produced: number;
  dispatched: number; // net of returns
}

export async function searchProductBatches(name: string): Promise<{ groups: ProductBatchGroup[] } | { error: string }> {
  const { data: cls } = await supabase
    .from("checklists")
    .select("id, name")
    .eq("category", "Production")
    .ilike("name", `%${name}%`);

  if (!cls || cls.length === 0) {
    return { error: `No production records found for a product matching "${name}".` };
  }

  const clById = Object.fromEntries(cls.map((c: { id: string; name: string }) => [c.id, c.name]));
  const subs = await fetchAll<BatchInfo & { checklist_id: string }>((from, to) =>
    supabase
      .from("submissions")
      .select("checklist_id, " + SUBMISSION_SELECT)
      .in("checklist_id", cls.map((c: { id: string }) => c.id))
      .order("submitted_at", { ascending: false })
      .range(from, to) as never
  );

  if (subs.length === 0) {
    return { error: `No production batches recorded yet for "${name}".` };
  }

  // Group by product + batch code — the batch code is what's printed on the jar,
  // so it's the unit of recall (a code can span several production submissions).
  const groups = new Map<string, ProductBatchGroup>();
  for (const s of subs) {
    const product = productNameFromChecklist(clById[s.checklist_id] ?? s.checklist?.name);
    const code = getBatchCode(s);
    const key = code ? `${product}|${code}` : `${product}|__uncoded__${s.id}`;
    const g = groups.get(key);
    if (g) {
      g.submission_ids.push(s.id);
      g.units_produced += getUnitsProduced(s);
      if (s.submitted_at < g.first_date) g.first_date = s.submitted_at;
      if (s.submitted_at > g.last_date) g.last_date = s.submitted_at;
    } else {
      groups.set(key, {
        product,
        batch_code: code,
        submission_ids: [s.id],
        first_date: s.submitted_at,
        last_date: s.submitted_at,
        units_produced: getUnitsProduced(s),
        dispatched: 0,
      });
    }
  }

  // Net units dispatched per submission so the picker can show what's already out.
  const allIds = subs.map((s) => s.id);
  const [disps, rets] = await Promise.all([fetchDispatchesForBatches(allIds), fetchReturnsForBatches(allIds)]);
  const netBySub: Record<string, number> = {};
  for (const d of disps) if (d.batch_submission_id) netBySub[d.batch_submission_id] = (netBySub[d.batch_submission_id] ?? 0) + (d.total_units ?? 0);
  for (const r of rets) if (r.batch_submission_id) netBySub[r.batch_submission_id] = (netBySub[r.batch_submission_id] ?? 0) - (r.quantity ?? 0);
  for (const g of groups.values()) g.dispatched = g.submission_ids.reduce((s, id) => s + (netBySub[id] ?? 0), 0);

  return { groups: [...groups.values()].sort((a, b) => (a.last_date < b.last_date ? 1 : -1)) };
}

// ── Backward recall — step 2: trace ONE chosen batch back to lots & customers ─
export async function traceFromBatchGroup(group: ProductBatchGroup): Promise<TraceOutcome> {
  const batches = await fetchBatches(group.submission_ids);
  if (batches.length === 0) return { error: "Batch record not found." };

  const [lots, dispatches, returns] = await Promise.all([
    fetchLots(Array.from(lotIdsFromBatches(batches))),
    fetchDispatchesForBatches(group.submission_ids),
    fetchReturnsForBatches(group.submission_ids),
  ]);

  return {
    result: await withReconciliation(await enrich({
      searchType: "batch",
      query: group.batch_code || group.product,
      product: group.product,
      lots,
      batches,
      dispatches,
      returns,
    })),
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
  //     (catches batches not yet dispatched or dispatched without a batch link).
  //     Filter by checklist at the DB level and paginate — an unranged select
  //     stops at 1000 rows and silently drops older batches from the trace.
  const { data: matchingCls } = await supabase
    .from("checklists")
    .select("id")
    .eq("category", "Production")
    .ilike("name", `%${name}%`);

  const directBatchIds =
    matchingCls && matchingCls.length > 0
      ? (
          await fetchAll<{ id: string }>((from, to) =>
            supabase
              .from("submissions")
              .select("id")
              .in("checklist_id", matchingCls.map((c: { id: string }) => c.id))
              .order("submitted_at", { ascending: false })
              .range(from, to)
          )
        ).map((s) => s.id)
      : [];

  const allBatchIds = [...new Set([...linkedBatchIds, ...directBatchIds])];
  const batches = await fetchBatches(allBatchIds);

  if (dispatches.length === 0 && batches.length === 0) {
    return { error: `No records found for product matching "${name}".` };
  }

  const lots = await fetchLots(Array.from(lotIdsFromBatches(batches)));
  const returns = await fetchReturnsForBatches(allBatchIds);

  return { result: await withReconciliation(await enrich({ searchType: "product", query: name, lots, batches, dispatches, returns })) };
}
