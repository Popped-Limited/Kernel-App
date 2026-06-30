// Multi-run production records.
//
// A single production record can capture several identical production *runs* in
// one day — each with its own ingredients/lots, CCPs, in-process checks and
// packing — that roll up to ONE batch code, best-before and finished-goods total.
//
// The "runs" zone of a record is everything from the ingredient table through the
// packing log. The master header (batch code, dates, operator) and master footer
// (total units produced, labelling, sign-off) wrap it. We DERIVE which questions
// repeat from the question structure, so no historic data is ever rewritten.
//
// Per-run answers are namespaced by run index in the answer map. Run 0 keeps the
// bare question id, so a single-run record is byte-identical to a pre-feature one.

type Q = { id: string; type: string; label: string };

// Once-per-record questions that stay master even when ordered among the runs.
const isFooterMaster = (q: Q): boolean =>
  q.type === "signature" ||
  (q.type === "number" && /total units produced/i.test(q.label)) ||
  (q.type === "checkbox" && /labelling verified/i.test(q.label));

/** Ids of the questions that repeat per run (ingredient table → packing log, minus footer masters). */
export function getRunQuestionIds(questions: Q[]): Set<string> {
  const ingIdx = questions.findIndex((q) => q.type === "ingredient_table");
  const packIdx = questions.findIndex((q) => q.type === "packing_runs");
  if (ingIdx === -1 || packIdx === -1) return new Set();
  const lo = Math.min(ingIdx, packIdx);
  const hi = Math.max(ingIdx, packIdx);
  const ids = new Set<string>();
  questions.forEach((q, i) => { if (i >= lo && i <= hi && !isFooterMaster(q)) ids.add(q.id); });
  return ids;
}

/** Split a record's questions into the three zones. Non-production records → all header. */
export function splitRunZones<T extends Q>(questions: T[]): { header: T[]; runs: T[]; footer: T[] } {
  const runIds = getRunQuestionIds(questions);
  if (runIds.size === 0) return { header: questions, runs: [], footer: [] };
  const firstRunIdx = questions.findIndex((q) => runIds.has(q.id));
  const header: T[] = [], runs: T[] = [], footer: T[] = [];
  questions.forEach((q, i) => {
    if (runIds.has(q.id)) runs.push(q);
    else if (i < firstRunIdx) header.push(q);
    else footer.push(q);
  });
  return { header, runs, footer };
}

/** The "Total units produced" master question, if present — its value is the editable day total. */
export function findTotalUnitsQuestion<T extends Q>(questions: T[]): T | undefined {
  return questions.find((q) => q.type === "number" && /total units produced/i.test(q.label));
}

const RUN_SEP = "::run";

/** Answer-map key for a question within a given run. Run 0 uses the bare id (back-compatible). */
export function runKey(questionId: string, runIdx: number): string {
  return runIdx === 0 ? questionId : `${questionId}${RUN_SEP}${runIdx}`;
}

/** Number of runs stored on a record (>= 1). */
export const RUN_COUNT_KEY = "__run_count__";

/** Per-run "good units produced" built-in field key. */
export function unitsKey(runIdx: number): string {
  return `__units__${RUN_SEP}${runIdx}`;
}

// A multi-run record stores each repeating answer as { __runs__: [v0, v1, …] },
// where every element is a normal single-run value string. Any code that parses a
// submitted ingredient_table / packing_runs answer must expand it first so all runs
// are counted. Single-run (unwrapped) values pass straight through.
export function expandRunValues(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.__runs__)) {
      return (parsed.__runs__ as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0);
    }
  } catch { /* not a runs wrapper */ }
  return [value];
}
