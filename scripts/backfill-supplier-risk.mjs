// Backfill auto-derived supplier risk for every existing supplier, all orgs.
// Run AFTER add-supplier-risk-automation.sql has been applied.
//
//   node scripts/backfill-supplier-risk.mjs           # dry run (prints changes)
//   node scripts/backfill-supplier-risk.mjs --commit   # apply
//
// Supplier risk = SAQ completed × valid (uploaded, non-expired) accreditation cert.
// Review frequency is recomputed from the SALSA matrix when a raw-material risk
// already exists. Raw-material risk itself is NOT backfilled (no stored calculator
// inputs exist) and is left untouched, as is next_review_due. Services are skipped.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMMIT = process.argv.includes("--commit");

// ── SALSA logic (mirrors lib/supplierRisk.ts) ───────────────────────────────
const calcSupplierRisk = (saq, cert) => (saq && cert ? "low" : saq || cert ? "medium" : "high");
const REVIEW_MATRIX = {
  low:    { low: 3, medium: 3, high: 2 },
  medium: { low: 3, medium: 2, high: 1 },
  high:   { low: 2, medium: 2, high: 1 },
};
const calcReviewFrequency = (supplierRisk, materialRisk) => REVIEW_MATRIX[materialRisk][supplierRisk];
function certIsValid(hasDoc, expiry) {
  if (!hasDoc) return false;
  if (!expiry) return true;
  const e = new Date(expiry); e.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return e.getTime() >= t.getTime();
}

async function main() {
  const { data: suppliers, error } = await sb
    .from("suppliers")
    .select("id, name, type, saq_completed, cert_expiry, supplier_risk, raw_material_risk, review_frequency_years, organisation_id");
  if (error) { console.error("Failed to read suppliers:", error.message); process.exit(1); }

  // Which suppliers have at least one accreditation document?
  const { data: docs, error: docErr } = await sb
    .from("documents")
    .select("entity_id")
    .eq("entity_type", "supplier")
    .eq("doc_type", "accreditation");
  if (docErr) { console.error("Failed to read documents:", docErr.message); process.exit(1); }
  const withDoc = new Set(docs.map(d => d.entity_id));

  let changed = 0, unchanged = 0, skipped = 0;
  console.log(`\n${COMMIT ? "APPLYING" : "DRY RUN"} — ${suppliers.length} suppliers\n`);

  for (const s of suppliers) {
    if (s.type === "service") { skipped++; continue; }

    const cert = certIsValid(withDoc.has(s.id), s.cert_expiry);
    const newSupplierRisk = calcSupplierRisk(s.saq_completed, cert);
    const newReviewYears = s.raw_material_risk
      ? calcReviewFrequency(newSupplierRisk, s.raw_material_risk)
      : s.review_frequency_years;

    const supplierRiskChanged = newSupplierRisk !== s.supplier_risk;
    const reviewChanged = (newReviewYears ?? null) !== (s.review_frequency_years ?? null);

    if (!supplierRiskChanged && !reviewChanged) { unchanged++; continue; }

    const parts = [];
    if (supplierRiskChanged) parts.push(`supplier_risk ${s.supplier_risk ?? "—"} → ${newSupplierRisk}`);
    if (reviewChanged) parts.push(`review ${s.review_frequency_years ?? "—"} → ${newReviewYears ?? "—"}yr`);
    console.log(`  ${s.name.padEnd(28)} ${parts.join(" · ")}  (SAQ ${s.saq_completed ? "✓" : "✗"}, cert ${cert ? "✓" : "✗"})`);

    if (COMMIT) {
      const { error: upErr } = await sb
        .from("suppliers")
        .update({ supplier_risk: newSupplierRisk, review_frequency_years: newReviewYears })
        .eq("id", s.id);
      if (upErr) { console.error(`    ✗ update failed: ${upErr.message}`); continue; }
    }
    changed++;
  }

  console.log(`\n${COMMIT ? "Updated" : "Would update"} ${changed} · unchanged ${unchanged} · skipped (service) ${skipped}`);
  if (!COMMIT) console.log("Re-run with --commit to apply.\n");
}

main();
