/**
 * Packing log (`packing_runs`) lot allocations.
 *
 * A packing entry can be split across more than one packaging lot — you run out
 * of jars from one delivery part-way through a batch and finish it from the next.
 * The breakdown lives in `jar_lots` / `lid_lots`; the flat `jar_lot_id` /
 * `jar_batch` / `jars_used` fields are kept in sync as a mirror of the FIRST
 * allocation plus the TOTAL count, so older readers (and every "units produced"
 * fallback, which reads `jars_used`) stay correct.
 *
 * Anything that deducts, reserves or traces packaging stock must go through
 * `packAllocations` / `packLotUses` — reading `jar_lot_id` alone under-counts a
 * split entry and leaves phantom stock on the lot that was really used.
 */

export type PackLotAlloc = {
  lot_id?: string;
  /** Julian code (linked lots) or free-typed batch number (unlinked packaging). */
  batch?: string;
  count?: string;
};

export type PackRunValue = {
  pack_weight?: string;
  jars_used?: string;
  jar_batch?: string;
  jar_lot_id?: string;
  jar_lots?: PackLotAlloc[];
  lids_count?: string;
  lids_batch?: string;
  lids_lot_id?: string;
  lid_lots?: PackLotAlloc[];
  packed_by?: string;
};

export type PackKind = "jar" | "lid";

/** Field names differ per side (historical): jars_used vs lids_count, etc. */
export const PACK_FIELDS = {
  jar: { allocs: "jar_lots", lotId: "jar_lot_id", batch: "jar_batch", count: "jars_used" },
  lid: { allocs: "lid_lots", lotId: "lids_lot_id", batch: "lids_batch", count: "lids_count" },
} as const;

/**
 * Every lot allocation for one side of a packing entry. Split entries return the
 * stored breakdown; unsplit/legacy entries return the single flat allocation.
 * Always returns at least one (possibly empty) allocation so the form can render.
 */
export function packAllocations(run: PackRunValue | null | undefined, kind: PackKind): PackLotAlloc[] {
  if (!run || typeof run !== "object") return [{ lot_id: "", batch: "", count: "" }];
  const f = PACK_FIELDS[kind];
  const stored = (run as Record<string, unknown>)[f.allocs];
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map((a: PackLotAlloc) => ({
      lot_id: a?.lot_id ?? "",
      batch: a?.batch ?? "",
      count: a?.count ?? "",
    }));
  }
  const r = run as Record<string, string | undefined>;
  return [{ lot_id: r[f.lotId] ?? "", batch: r[f.batch] ?? "", count: r[f.count] ?? "" }];
}

/** Total units for one side of an entry (summed across split lots). */
export function packTotal(run: PackRunValue | null | undefined, kind: PackKind): number {
  return packAllocations(run, kind).reduce((sum, a) => sum + (Number(a.count) || 0), 0);
}

/**
 * Stock claims made by one packing entry: `{lot_id, amount}` in units, both
 * sides, split lots included. Only lot-linked allocations count — free-typed
 * batch numbers aren't in `ingredient_lots` and deduct nothing.
 */
export function packLotUses(run: PackRunValue | null | undefined): Array<{ lot_id: string; amount: number }> {
  const out: Array<{ lot_id: string; amount: number }> = [];
  for (const kind of ["jar", "lid"] as const) {
    for (const a of packAllocations(run, kind)) {
      const amount = Number(a.count) || 0;
      if (a.lot_id && amount > 0) out.push({ lot_id: a.lot_id, amount });
    }
  }
  return out;
}

/**
 * Write an updated set of allocations back onto an entry, keeping the flat
 * mirror fields in step: first allocation's lot/batch, and the summed count.
 * A count of zero is stored as "" so "have you filled the packing log in?"
 * checks still see an empty field.
 */
export function withPackAllocations(
  run: PackRunValue,
  kind: PackKind,
  allocs: PackLotAlloc[],
): PackRunValue {
  const f = PACK_FIELDS[kind];
  const list = allocs.length > 0 ? allocs : [{ lot_id: "", batch: "", count: "" }];
  const total = list.reduce((sum, a) => sum + (Number(a.count) || 0), 0);
  return {
    ...run,
    [f.allocs]: list,
    [f.lotId]: list[0].lot_id ?? "",
    [f.batch]: list[0].batch ?? "",
    [f.count]: total > 0 ? String(total) : "",
  };
}

/** Batch codes on one side, in order, for display (e.g. "26175, 26182"). */
export function packBatchCodes(run: PackRunValue | null | undefined, kind: PackKind): string[] {
  return packAllocations(run, kind)
    .map((a) => (a.batch ?? "").trim())
    .filter(Boolean);
}
