// Backfill Yep Kitchen's historical wastage variance.
//
// Before 2 Jul 2026 the wastage_log table didn't exist in production, so every
// Raw Materials "Reconcile" updated the lot's remaining quantity but the log
// insert failed silently. Result: lots whose mass balance doesn't add up
// (received − used in production − written off − remaining > 0) with no record
// of where the missing stock went. Tom has confirmed these were all wastage.
//
// This script writes, for each affected lot, the same row the app's "Explain
// variance" mode writes: a wastage_log entry closing the gap WITHOUT touching
// quantity_remaining_g. Lots received on/after 2 Jul 2026 are never backfilled —
// a gap on those is a live bug and is reported instead.
//
//   node scripts/backfill-yep-variance.mjs            → DRY RUN (report only)
//   node scripts/backfill-yep-variance.mjs --commit   → write the log entries
//
// Idempotent: the gap is recomputed from live data each run, so already-logged
// variance (by this script or by hand in the app) shrinks the gap to ~0 and the
// lot is skipped on the next run.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const YEP = "15a33d45-60a8-453e-a5e2-b3ccb3860ead";
const WASTAGE_LOG_CREATED = "2026-07-02"; // lots received on/after this date must balance on their own
const NOTES = "Historical wastage backfill — reconciled in-app before 2 Jul 2026, when the wastage log didn't exist to record it";
const CREATED_BY = "Tom Palmer";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: yepOrg } = await db.from("organisations").select("id, name").eq("id", YEP).single();
if (!yepOrg || !/yep/i.test(yepOrg.name)) { console.error("Abort: org id did not resolve to Yep Kitchen."); process.exit(1); }
console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — backfilling variance for "${yepOrg.name}"\n`);

const chunk = (arr, n) => arr.reduce((c, x, i) => (i % n ? c[c.length - 1].push(x) : c.push([x]), c), []);

/** Paginate past the 1000-row PostgREST cap (service role bypasses RLS → filter by org). */
async function readAll(build) {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// ── 1. Ingredients + lots ─────────────────────────────────────────────────────
const ingredients = await readAll(() =>
  db.from("ingredients").select("id, name, unit").eq("organisation_id", YEP).order("id"));
const ingredientById = Object.fromEntries(ingredients.map((i) => [i.id, i]));

const lots = await readAll(() =>
  db.from("ingredient_lots")
    .select("id, ingredient_id, julian_code, quantity_received_g, quantity_remaining_g, received_date")
    .in("ingredient_id", ingredients.map((i) => i.id))
    .order("id"));

// ── 2. Production usage per lot (mirrors lotUsesFromAnswer in lib/traceability.ts) ──
const submissions = await readAll(() =>
  db.from("submissions").select("id").eq("organisation_id", YEP).order("id"));

const usedByLot = {};
for (const subIds of chunk(submissions.map((s) => s.id), 100)) {
  const answers = await readAll(() =>
    db.from("answers")
      .select("value, question:questions!inner(type)")
      .in("submission_id", subIds)
      .in("questions.type", ["ingredient_table", "packing_runs"])
      .order("id"));
  for (const ans of answers) {
    // Multi-run records wrap each run's value in { __runs__: [...] }
    let values = [ans.value];
    try {
      const p = JSON.parse(ans.value);
      if (p && typeof p === "object" && Array.isArray(p.__runs__)) values = p.__runs__;
    } catch { /* not JSON-wrapped */ }
    for (const v of values) {
      if (v == null) continue;
      try {
        const parsed = typeof v === "string" ? JSON.parse(v) : v;
        if (ans.question.type === "packing_runs") {
          for (const run of (Array.isArray(parsed) ? parsed : [])) {
            if (run.jar_lot_id && Number(run.jars_used) > 0) usedByLot[run.jar_lot_id] = (usedByLot[run.jar_lot_id] ?? 0) + Number(run.jars_used);
            if (run.lids_lot_id && Number(run.lids_count) > 0) usedByLot[run.lids_lot_id] = (usedByLot[run.lids_lot_id] ?? 0) + Number(run.lids_count);
          }
        } else {
          const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
          for (const row of rows) for (const rl of (row.lots ?? [])) {
            if (rl.lot_id) usedByLot[rl.lot_id] = (usedByLot[rl.lot_id] ?? 0) + (Number(rl.weight_g) || 0);
          }
        }
      } catch { /* malformed answer */ }
    }
  }
}

// ── 3. Existing write-offs per lot ────────────────────────────────────────────
const wastage = await readAll(() =>
  db.from("wastage_log").select("lot_id, quantity_written_off_g").eq("organisation_id", YEP).order("id"));
const writtenOffByLot = {};
for (const w of wastage) {
  if (w.lot_id) writtenOffByLot[w.lot_id] = (writtenOffByLot[w.lot_id] ?? 0) + (Number(w.quantity_written_off_g) || 0);
}

// ── 4. Compute gaps ───────────────────────────────────────────────────────────
const fmt = (g, unit) => unit === "units" ? `${Math.round(g)} units` : `${(g / 1000).toFixed(2)} kg`;

const toBackfill = [];
const anomalies = []; // gaps on lots received after the wastage log existed
const unitLots = []; // packaging (unit-counted) lots: gaps are mostly production
                     // use from before jar-lot linking existed (24 Jun 2026), NOT
                     // wastage — never auto-label these; review by hand.
let negatives = 0;

for (const lot of lots) {
  const ing = ingredientById[lot.ingredient_id];
  if (!ing) continue;
  const unit = ing.unit ?? "g";
  const tolerance = unit === "units" ? 0.5 : 5;
  const used = usedByLot[lot.id] ?? 0;
  const writtenOff = writtenOffByLot[lot.id] ?? 0;
  const gap = (Number(lot.quantity_received_g) || 0) - used - writtenOff - (Number(lot.quantity_remaining_g) || 0);
  if (gap < -tolerance) negatives++;
  if (gap <= tolerance) continue;
  const row = { lot, ing, unit, used, writtenOff, gap };
  if (unit === "units") unitLots.push(row);
  else if (lot.received_date >= WASTAGE_LOG_CREATED) anomalies.push(row);
  else toBackfill.push(row);
}

toBackfill.sort((a, b) => a.ing.name.localeCompare(b.ing.name) || a.lot.julian_code.localeCompare(b.lot.julian_code));

console.log(`Lots checked: ${lots.length} · balanced: ${lots.length - toBackfill.length - anomalies.length} (${negatives} with a negative gap — untouched)\n`);

if (toBackfill.length === 0) {
  console.log("No historical gaps to backfill.");
} else {
  console.log(`Historical gaps to log as wastage (${toBackfill.length} lots):`);
  let totalG = 0;
  for (const { lot, ing, unit, used, writtenOff, gap } of toBackfill) {
    if (unit !== "units") totalG += gap;
    console.log(
      `  ${ing.name.padEnd(34)} lot ${lot.julian_code.padEnd(8)} received ${fmt(lot.quantity_received_g, unit).padStart(11)}` +
      ` · used ${fmt(used, unit).padStart(11)} · written off ${fmt(writtenOff, unit).padStart(10)}` +
      ` · remaining ${fmt(lot.quantity_remaining_g, unit).padStart(10)} → gap ${fmt(gap, unit)}`
    );
  }
  console.log(`\n  Total (weight-based lots): ${(totalG / 1000).toFixed(2)} kg`);
}

if (unitLots.length > 0) {
  console.log(`\n⚠ Packaging (unit-counted) lots with gaps — NOT backfilled (likely production use from before jar-lot linking, not wastage):`);
  for (const { lot, ing, unit, gap } of unitLots) {
    console.log(`  ${ing.name} lot ${lot.julian_code} (received ${lot.received_date}) → gap ${fmt(gap, unit)}`);
  }
}

if (anomalies.length > 0) {
  console.log(`\n⚠ Gaps on lots received AFTER ${WASTAGE_LOG_CREATED} — NOT backfilled, investigate these:`);
  for (const { lot, ing, unit, gap } of anomalies) {
    console.log(`  ${ing.name} lot ${lot.julian_code} (received ${lot.received_date}) → gap ${fmt(gap, unit)}`);
  }
}

// ── 5. Write ──────────────────────────────────────────────────────────────────
if (!COMMIT) {
  console.log("\nDry run — nothing written. Re-run with --commit to log these.");
  process.exit(0);
}

let ok = 0;
for (const { lot, ing, gap } of toBackfill) {
  const remaining = Number(lot.quantity_remaining_g) || 0;
  const { error } = await db.from("wastage_log").insert({
    organisation_id: YEP,
    lot_id: lot.id,
    ingredient_id: ing.id,
    julian_code: lot.julian_code,
    ingredient_name: ing.name,
    // Stock physically went from remaining+gap to remaining at some unlogged
    // earlier point — record exactly that; quantity_remaining_g is untouched.
    adjusted_from_g: remaining + gap,
    adjusted_to_g: remaining,
    reason: "wastage",
    notes: NOTES,
    created_by: CREATED_BY,
  });
  if (error) console.error(`  FAILED ${ing.name} lot ${lot.julian_code}: ${error.message}`);
  else ok++;
}
console.log(`\nDone — ${ok}/${toBackfill.length} variance entries written. Stock quantities untouched.`);
