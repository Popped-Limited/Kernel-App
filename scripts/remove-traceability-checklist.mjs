// Removes the legacy "Traceability Test (Mock Recall)" checklist now that the
// dedicated Mock Recall tool replaces it.
//
//   • If a checklist has NO submissions  → hard-delete it (and its questions).
//   • If it HAS historical submissions    → archive it (active = false) so the
//     audit history is preserved but it no longer appears in the fillable list.
//
// Service role bypasses RLS, so this covers every organisation in one run.
//   node scripts/remove-traceability-checklist.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Parse .env.local without adding a dotenv dependency
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: checklists, error } = await supabase
  .from("checklists")
  .select("id, name, organisation_id, active")
  .ilike("name", "%Traceability Test%Mock Recall%");

if (error) { console.error("Lookup failed:", error.message); process.exit(1); }
if (!checklists?.length) { console.log("No legacy traceability checklist found — nothing to do."); process.exit(0); }

for (const cl of checklists) {
  const { count } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("checklist_id", cl.id);

  if ((count ?? 0) === 0) {
    await supabase.from("questions").delete().eq("checklist_id", cl.id);
    const { error: delErr } = await supabase.from("checklists").delete().eq("id", cl.id);
    console.log(delErr
      ? `✗ ${cl.id} (org ${cl.organisation_id}) delete failed: ${delErr.message}`
      : `✓ Deleted "${cl.name}" (org ${cl.organisation_id}) — no submissions.`);
  } else {
    const { error: arcErr } = await supabase.from("checklists").update({ active: false }).eq("id", cl.id);
    console.log(arcErr
      ? `✗ ${cl.id} (org ${cl.organisation_id}) archive failed: ${arcErr.message}`
      : `✓ Archived "${cl.name}" (org ${cl.organisation_id}) — ${count} submission(s) preserved.`);
  }
}
