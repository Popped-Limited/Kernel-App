// Finished-goods stock: the single source of truth for parsing production
// records and computing per-batch remaining stock. Used by BOTH the finished-
// goods list page and the per-product Stock & batches tab so the two can never
// disagree (per CLAUDE.md's finished-goods rules).
//
// Stock is product-level and computed live: produced − dispatched + returns +
// batch-tagged adjustments, matched by EXACT product name. Dispatches/returns
// link to a production batch via batch_submission_id; adjustments link by
// batch_code. Over-dispatched batches floor at 0 (never negative).

import type { Dispatch, FinishedGoodsAdjustment, GoodsReturn } from "@/lib/types";
import { expandRunValues } from "@/lib/production-runs";

export interface ProductionRecord {
  id: string;
  submitted_at: string;
  submitted_by: string;
  product: string;
  jars: number;
  batchCode: string | null;
  bbe: string | null;
}

export interface BatchRow {
  code: string;
  date: string;
  bbe: string | null;
  produced: number;
  remaining: number;
}

/** Strip the "— Production Record" suffix from a checklist name → product name. */
export function productFromChecklistName(name: string): string {
  return name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
}

/**
 * Parse production submissions → per-record units produced + batch code.
 * Prefers the explicit "Total units produced" answer, falling back to the
 * packing-log jars_used total. Only records that produced > 0 units are kept.
 */
export function parseProductionRecords(subData: any[]): ProductionRecord[] {
  const prods: ProductionRecord[] = [];
  for (const sub of subData) {
    const cl = sub.checklist as { name: string; category: string } | null;
    if (!cl || cl.category !== "Production") continue;
    const product = productFromChecklistName(cl.name);
    let totalUnits = 0;
    let jarsUsedFallback = 0;
    let batchCode: string | null = null;
    let bbe: string | null = null;
    for (const ans of ((sub.answers ?? []) as any[])) {
      if (!ans.value) continue;
      const label = (ans.question?.label ?? "").toLowerCase();
      // Prefer explicit "total units produced" answer
      if (label.includes("total units produced")) {
        totalUnits += Number(ans.value) || 0;
      }
      // Capture the batch code so reconciliations can be tied to a batch.
      // Must be a text field — otherwise the checkbox "Labelling verified —
      // correct batch code…" matches and stores its "true" value as a batch.
      if (!batchCode && ans.question?.type === "text" && ans.value.trim() &&
          (label.includes("batch code") || label.includes("julian") || label.includes("batch ref") || label.includes("lot number"))) {
        batchCode = ans.value.trim();
      }
      // Capture the BBE — only an actual date counts, so the checkbox
      // "Labelling verified — … best before date …" ("true"/"false") and other
      // non-date answers mentioning "best before" are skipped.
      if (!bbe && (label.includes("best before") || label.includes("bbe"))) {
        const v = ans.value.trim();
        if (ans.question?.type === "date" || /^\d{4}-\d{2}-\d{2}/.test(v)) {
          bbe = v;
        }
      }
      // Fallback: sum jars_used from packing_runs (across all runs of the record)
      if (ans.question?.type === "packing_runs") {
        for (const v of expandRunValues(ans.value)) {
          try {
            const rows = JSON.parse(v);
            if (Array.isArray(rows)) for (const r of rows) jarsUsedFallback += Number(r.jars_used) || 0;
          } catch { /* ignore */ }
        }
      }
    }
    const jars = totalUnits > 0 ? totalUnits : jarsUsedFallback;
    if (jars > 0) prods.push({ id: sub.id, submitted_at: sub.submitted_at, submitted_by: sub.submitted_by, product, jars, batchCode, bbe });
  }
  return prods;
}

export interface StockSources {
  productions: ProductionRecord[];
  dispatches: Dispatch[];
  returns: GoodsReturn[];
  adjustments: FinishedGoodsAdjustment[];
}

/**
 * Per-batch remaining stock for one product: produced − dispatched + returns +
 * batch-tagged adjustments. Only batches we actually produced count — an
 * untagged/opening-stock adjustment stays product-level and is not shown here.
 */
export function computeBatchBreakdown(product: string, src: StockSources): BatchRow[] {
  const { productions, dispatches, returns, adjustments } = src;
  const prodList = productions.filter(p => p.product === product && p.batchCode);

  const subToCode: Record<string, string> = {};
  const producedByCode: Record<string, number> = {};
  const dateByCode: Record<string, string> = {};
  const bbeByCode: Record<string, string | null> = {};
  for (const p of prodList) {
    const code = p.batchCode!;
    subToCode[p.id] = code;
    producedByCode[code] = (producedByCode[code] ?? 0) + p.jars;
    if (!dateByCode[code] || new Date(p.submitted_at) > new Date(dateByCode[code])) {
      dateByCode[code] = p.submitted_at;
    }
    if (p.bbe && !bbeByCode[code]) bbeByCode[code] = p.bbe;
  }

  // net OUT of each batch (positive = left stock)
  const netOutByCode: Record<string, number> = {};
  for (const d of dispatches) {
    if (d.product !== product || !d.batch_submission_id) continue;
    const code = subToCode[d.batch_submission_id];
    if (!code) continue;
    netOutByCode[code] = (netOutByCode[code] ?? 0) + d.total_units;
  }
  for (const r of returns) {
    if (r.product !== product || !r.batch_submission_id) continue;
    const code = subToCode[r.batch_submission_id];
    if (!code) continue;
    netOutByCode[code] = (netOutByCode[code] ?? 0) - r.quantity;
  }
  for (const a of adjustments) {
    if (a.product !== product || !a.batch_code) continue;
    if (!(a.batch_code in producedByCode)) continue;
    netOutByCode[a.batch_code] = (netOutByCode[a.batch_code] ?? 0) - a.quantity;
  }

  return Object.keys(producedByCode)
    .map(code => ({
      code,
      date: dateByCode[code],
      bbe: bbeByCode[code] ?? null,
      produced: producedByCode[code],
      remaining: Math.max(0, producedByCode[code] - (netOutByCode[code] ?? 0)),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Total in-stock = sum of remaining across every batch of the product. */
export function stockFor(product: string, src: StockSources): number {
  return computeBatchBreakdown(product, src).reduce((s, b) => s + b.remaining, 0);
}
