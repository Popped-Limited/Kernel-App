// Build the SALSA baseline template from Yep Kitchen's (SALSA-approved) checklists.
//
//   node scripts/build-salsa-baseline.mjs
//
// Reads the 20 generic compliance checklists + their questions, plus the
// training-programme items, from Yep Kitchen and writes a frozen, org-agnostic
// template to lib/seed/salsa-baseline.json. New accounts are seeded from that
// file (see lib/seed/salsa-baseline.ts) — NOT from Yep's live data — so future
// edits Yep makes never leak into new customers.
//
// Deliberately excluded:
//   • the 8 per-product "— Production Record" checklists (start blank per org)
//   • all of Yep's submissions/answers, suppliers, ingredients, staff
//   • SAQ questions (the saq_questions table is global — every org sees it)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const YEP = "15a33d45-60a8-453e-a5e2-b3ccb3860ead";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// The 20 checklists to copy, by exact Yep name. Anything not listed (incl. the
// 8 production records) is left out — whitelist, so nothing leaks by accident.
const INCLUDE = [
  "Closing Checks",
  "Complaint Form",
  "Corrective Action Report",
  "Daily Cleaning",
  "Employee Induction Checklist",
  "Food Safety Booklet Questionnaire",
  "Goods In Record",
  "Goods Out Record",
  "Hygiene Swab",
  "Laundry Checklist",
  "Maintenance Report",
  "Monthly Cleaning",
  "Opening Checks",
  "Pre-employment medical questionnaire",
  "Probe Calibration",
  "Return to Work Approval",
  "Return to Work Self Assessment",
  "Scale Calibration",
  "Visitor Sign In & Health Questionnaire",
  "Weekly Cleaning",
];

// Per-checklist question removals (Yep-specific equipment a generic SALSA
// business won't have). Matched by exact label, confirmed with Tom.
const REMOVE_QUESTIONS = {
  "Daily Cleaning": [
    "Cooking kettle cleaned and sanitised",
    "Robo Coupe cleaned and sanitised",
    "Hot holding tanks cleaned and sanitised",
    "Hot filling line cleaned and sanitised",
    "Cold filling line cleaned and sanitised",
  ],
  "Monthly Cleaning": [
    "Extraction unit cleaned and sanitised",
  ],
};

const { data: allChecklists, error: clErr } = await db
  .from("checklists").select("*").eq("organisation_id", YEP);
if (clErr) { console.error(clErr); process.exit(1); }

const missing = INCLUDE.filter((n) => !allChecklists.some((c) => c.name === n));
if (missing.length) { console.error("Abort — checklists not found in Yep:", missing); process.exit(1); }

const checklists = [];
for (const name of INCLUDE) {
  const cl = allChecklists.find((c) => c.name === name);
  const { data: qs, error: qErr } = await db
    .from("questions").select("*").eq("checklist_id", cl.id);
  if (qErr) { console.error(qErr); process.exit(1); }

  const remove = REMOVE_QUESTIONS[name] ?? [];
  const stillToRemove = new Set(remove);

  const kept = qs
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .filter((q) => {
      if (stillToRemove.has(q.label)) { stillToRemove.delete(q.label); return false; }
      return true;
    })
    // re-sequence order_index so there are no gaps after removal
    .map((q, i) => ({
      label: q.label,
      type: q.type,
      required: q.required,
      order_index: i,
      options: q.options,
      hint: q.hint,
      follow_up: q.follow_up,
      document_path: q.document_path,
      document_required: q.document_required,
    }));

  if (stillToRemove.size) {
    console.error(`Abort — "${name}" expected to remove but did not find:`, [...stillToRemove]);
    process.exit(1);
  }

  checklists.push({
    name: cl.name,
    frequency: cl.frequency,
    description: cl.description,
    active: cl.active,
    category: cl.category,
    color: cl.color,
    questions: kept,
  });
}

// Training-programme items (the "Manage Training" list — no completion records).
const { data: trainingItems, error: tiErr } = await db
  .from("training_items").select("*").eq("organisation_id", YEP);
if (tiErr) { console.error(tiErr); process.exit(1); }
const training_items = trainingItems
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  .map((t) => ({ name: t.name, sort_order: t.sort_order, active: t.active, document_path: t.document_path }));

const template = {
  generated_at: new Date().toISOString(),
  source: "Yep Kitchen (SALSA-approved)",
  note: "Frozen SALSA baseline. Rebuild with: node scripts/build-salsa-baseline.mjs",
  checklists,
  training_items,
};

mkdirSync(new URL("../lib/seed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../lib/seed/salsa-baseline.json", import.meta.url), JSON.stringify(template, null, 2) + "\n");

console.log(`Wrote lib/seed/salsa-baseline.json`);
console.log(`  ${checklists.length} checklists, ${checklists.reduce((n, c) => n + c.questions.length, 0)} questions, ${training_items.length} training items`);
for (const c of checklists) console.log(`   • ${c.name.padEnd(40)} ${c.questions.length} q`);
