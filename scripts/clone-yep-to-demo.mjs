// Clone Yep Kitchen's operational data into the Popped (demo) account so the
// demo can be tested against realistic data.
//
//   node scripts/clone-yep-to-demo.mjs            → DRY RUN (reports only, no writes)
//   node scripts/clone-yep-to-demo.mjs --commit   → wipes demo data + clones for real
//
// Safety:
//   • Demo org id is hard-asserted; every INSERT is forced to organisation_id =
//     DEMO and every DELETE is filtered to organisation_id = DEMO. The source
//     (Yep Kitchen) is only ever READ.
//   • Foreign keys are remapped to the freshly-created demo copies, including the
//     lot_id references embedded in each answer's ingredient_table JSON.
//   • Skips: team members/logins, billing, SOPs, production calendar, wastage_log,
//     training_sessions (admin key has no access), batch_drafts, reminders, logs.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const YEP = "15a33d45-60a8-453e-a5e2-b3ccb3860ead";
const DEMO = "00000000-0000-0000-0000-000000000000";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Guard: confirm the two orgs are who we think they are before doing anything.
const { data: orgs } = await db.from("organisations").select("id, name");
const demoOrg = orgs?.find((o) => o.id === DEMO);
const yepOrg = orgs?.find((o) => o.id === YEP);
if (!demoOrg || !/popped/i.test(demoOrg.name)) { console.error("Abort: demo org id did not resolve to Popped."); process.exit(1); }
if (!yepOrg || !/yep/i.test(yepOrg.name)) { console.error("Abort: source org id did not resolve to Yep Kitchen."); process.exit(1); }

console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — cloning "${yepOrg.name}" → "${demoOrg.name}"\n`);

const log = (...a) => console.log(...a);
const chunk = (arr, n) => arr.reduce((c, x, i) => (i % n ? c[c.length - 1].push(x) : c.push([x]), c), []);

/** Read every row of `table` for Yep, paginating past the 1000-row PostgREST cap. */
async function readYep(table, select = "*") {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(select).eq("organisation_id", YEP).range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

const failures = [];

/** Delete all demo rows of `table` (child→parent order is the caller's job). */
async function wipeDemo(table) {
  if (!COMMIT) return;
  const { error } = await db.from(table).delete().eq("organisation_id", DEMO);
  if (error) failures.push(`wipe ${table}: ${error.message}`);
}

/** Insert rows (already org-stamped) in chunks, asserting org safety. Returns rows written. */
async function insertRows(table, rows) {
  if (rows.some((r) => r.organisation_id !== DEMO)) throw new Error(`SAFETY: ${table} row not stamped DEMO`);
  if (!COMMIT || rows.length === 0) return rows.length;
  for (const part of chunk(rows, 400)) {
    const { error } = await db.from(table).insert(part);
    if (error) { failures.push(`insert ${table}: ${error.message}`); return 0; }
  }
  return rows.length;
}

const plan = [];
const note = (table, copy, del) => plan.push({ table, copy, del });

// ── 1. Wipe demo in child→parent order ──────────────────────────────────────
// (done first so FK constraints don't block the parent deletes)
for (const t of [
  "answers", "dispatches", "finished_goods_adjustments", "batch_drafts",
  "checklist_reminders", "alert_log", "submissions", "questions", "checklists",
  "training_records", "training_items", "documents", "ingredient_lots",
  "ingredients", "suppliers",
]) {
  await wipeDemo(t);
}

// ── 2. Copy parent → child, building id maps ─────────────────────────────────
const supplierMap = new Map(), ingredientMap = new Map(), lotMap = new Map();
const checklistMap = new Map(), questionMap = new Map(), submissionMap = new Map();
const trainingItemMap = new Map();

// suppliers (drop unique saq_token to avoid cross-org collisions)
{
  const src = await readYep("suppliers");
  const rows = src.map((s) => { const id = randomUUID(); supplierMap.set(s.id, id); return { ...s, id, organisation_id: DEMO, saq_token: null }; });
  await insertRows("suppliers", rows); note("suppliers", rows.length, true);
}
// ingredients (supplier_id → new)
{
  const src = await readYep("ingredients");
  const rows = src.map((x) => { const id = randomUUID(); ingredientMap.set(x.id, id); return { ...x, id, organisation_id: DEMO, supplier_id: x.supplier_id ? supplierMap.get(x.supplier_id) ?? null : null }; });
  await insertRows("ingredients", rows); note("ingredients", rows.length, true);
}
// ingredient_lots (ingredient_id → new)
{
  const src = await readYep("ingredient_lots");
  const rows = src.map((x) => { const id = randomUUID(); lotMap.set(x.id, id); return { ...x, id, organisation_id: DEMO, ingredient_id: ingredientMap.get(x.ingredient_id) ?? null }; });
  await insertRows("ingredient_lots", rows); note("ingredient_lots", rows.length, true);
}
// checklists (drop unique public_token)
{
  const src = await readYep("checklists");
  const rows = src.map((x) => { const id = randomUUID(); checklistMap.set(x.id, id); return { ...x, id, organisation_id: DEMO, public_token: null }; });
  await insertRows("checklists", rows); note("checklists", rows.length, true);
}
// questions (checklist_id → new)
{
  const src = await readYep("questions");
  const rows = src.map((x) => { const id = randomUUID(); questionMap.set(x.id, id); return { ...x, id, organisation_id: DEMO, checklist_id: checklistMap.get(x.checklist_id) ?? null }; });
  await insertRows("questions", rows); note("questions", rows.length, true);
}
// submissions (checklist_id → new; team_member_id dropped)
{
  const src = await readYep("submissions");
  const rows = src.map((x) => { const id = randomUUID(); submissionMap.set(x.id, id); return { ...x, id, organisation_id: DEMO, checklist_id: checklistMap.get(x.checklist_id) ?? null, team_member_id: null }; });
  await insertRows("submissions", rows); note("submissions", rows.length, true);
}
// answers (submission_id, question_id → new; rewrite lot_id inside ingredient_table JSON)
{
  const src = await readYep("answers");
  const rows = src.map((x) => ({
    ...x,
    id: randomUUID(),
    organisation_id: DEMO,
    submission_id: submissionMap.get(x.submission_id) ?? null,
    question_id: questionMap.get(x.question_id) ?? null,
    value: rewriteLotIds(x.value),
  }));
  await insertRows("answers", rows); note("answers", rows.length, true);
}
// dispatches (batch_submission_id → new)
{
  const src = await readYep("dispatches");
  const rows = src.map((x) => ({ ...x, id: randomUUID(), organisation_id: DEMO, batch_submission_id: x.batch_submission_id ? submissionMap.get(x.batch_submission_id) ?? null : null }));
  await insertRows("dispatches", rows); note("dispatches", rows.length, true);
}
// finished_goods_adjustments (no id FKs — product/batch_code are text)
{
  const src = await readYep("finished_goods_adjustments");
  const rows = src.map((x) => ({ ...x, id: randomUUID(), organisation_id: DEMO }));
  await insertRows("finished_goods_adjustments", rows); note("finished_goods_adjustments", rows.length, true);
}
// training_items
{
  const src = await readYep("training_items");
  const rows = src.map((x) => { const id = randomUUID(); trainingItemMap.set(x.id, id); return { ...x, id, organisation_id: DEMO }; });
  await insertRows("training_items", rows); note("training_items", rows.length, true);
}
// training_records — SKIPPED: team_member_id is NOT NULL and references real
// team members / logins, which we deliberately do not clone into the demo.
// documents (best-effort polymorphic entity_id remap; file_path points at shared storage)
{
  const everyMap = [supplierMap, ingredientMap, lotMap, checklistMap, submissionMap, questionMap, trainingItemMap];
  const remapEntity = (eid) => { for (const m of everyMap) if (m.has(eid)) return m.get(eid); return eid; };
  const src = await readYep("documents");
  const rows = src.map((x) => ({ ...x, id: randomUUID(), organisation_id: DEMO, entity_id: x.entity_id ? remapEntity(x.entity_id) : x.entity_id }));
  await insertRows("documents", rows); note("documents", rows.length, true);
}

/** Rewrite ingredient_table answer JSON so embedded lot_id values point at the new demo lots. */
function rewriteLotIds(value) {
  if (!value) return value;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return value; }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) return value;
  let touched = false;
  for (const row of rows) {
    for (const rl of (row.lots ?? [])) {
      if (rl.lot_id && lotMap.has(rl.lot_id)) { rl.lot_id = lotMap.get(rl.lot_id); touched = true; }
    }
  }
  return touched ? JSON.stringify(parsed) : value;
}

// ── Report ───────────────────────────────────────────────────────────────────
log("Plan (rows to copy from Yep → demo; demo existing rows are wiped first):\n");
const failedTables = new Set(failures.map((f) => f.split(" ")[1].replace(":", "")));
for (const p of plan) log(`  ${p.table.padEnd(28)} copy ${String(p.copy).padStart(5)}${failedTables.has(p.table) ? "   ✗ NOT WRITTEN (permission)" : ""}`);
if (failures.length) {
  log(`\n⚠ ${failures.length} table(s) could not be written by the admin key:`);
  for (const f of failures) log(`   ${f}`);
}
log(`\n${COMMIT ? "Clone run finished." : "Dry run only — nothing was changed. Re-run with --commit to apply."}`);
