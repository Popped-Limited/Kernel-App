"use client";

// Spec sheet tab — the fields that only exist on a specification, plus the PDF
// generator. Everything that lives somewhere else in Kernel is PULLED, never
// re-typed here:
//   • ingredient declaration / QUID / allergens / nutrition → the recipe calc
//   • company information                                   → Account → Company details
//   • organoleptic standard                                 → the Organoleptic tab
//   • microbiological limits                                → read off the lab reports by AI
// so adding a second product doesn't mean typing the same data again.
//
// @react-pdf/renderer is heavy, so SpecSheetPDF is loaded via dynamic import()
// inside the download handler — never statically.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { useProductNutrition } from "@/components/useProductNutrition";
import { computeNutrition, NUTRIENT_KEYS, type CalcResult, type NutrientKey } from "@/lib/nutrition/recipe-calc";
import {
  loadSpecRow, saveSpecPatch, loadCompanyDetails, companyIsComplete,
} from "@/components/useProductSpecSheet";
import {
  type CompanyDetails, type SpecData, type MicroRow,
  SPEC_ALLERGENS, SUITABILITY_ROWS,
  defaultSpecData, mergeSpecData, todayUK,
} from "@/lib/spec-sheet";
import type { DeclarationPart, NutritionRow } from "@/components/SpecSheetPDF";

const PACK_SHOT_ACCEPT = /\.(png|jpe?g)$/i;

const NUTRITION_LABELS: [NutrientKey, string][] = [
  ["energy_kj", "Energy (kJ)"],
  ["energy_kcal", "Energy (kcal)"],
  ["fat_g", "Fat (g)"],
  ["saturates_g", "Of which saturates (g)"],
  ["carbohydrate_g", "Carbohydrates (g)"],
  ["sugars_g", "Of which sugars (g)"],
  ["fibre_g", "Fibre (g)"],
  ["protein_g", "Protein (g)"],
  ["salt_g", "Salt (g)"],
];

/** One extracted micro row awaiting the user's confirmation. */
interface ExtractedMicro {
  test: string;
  target: string;
  result: string;
  source: string;
  use: boolean;
}

function publicUrl(path: string) {
  return supabase.storage.from("compliance-docs").getPublicUrl(path).data.publicUrl;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea className="input" rows={2} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input type="text" className="input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** A value that lives elsewhere in Kernel: shown, not editable, with a link to its home. */
function PulledRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm py-1">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-900 whitespace-pre-wrap">{value || <span className="text-gray-300">Not set</span>}</span>
    </div>
  );
}

export default function ProductSpecSheetPanel({ productName }: { productName: string }) {
  const { orgId, orgName } = useOrganisation();
  const pathname = usePathname();
  const nutrition = useProductNutrition(productName);

  const result: CalcResult = useMemo(() => {
    const prepMap = new Map<string, number>();
    for (const [k, v] of Object.entries(nutrition.settings.prepYields)) {
      const pct = parseFloat(v);
      if (!isNaN(pct)) prepMap.set(k, pct / 100);
    }
    return computeNutrition({
      recipe: nutrition.recipe,
      ingredients: nutrition.ingredients,
      prepYields: prepMap,
      netWeightPerUnitG: nutrition.settings.netWeight ? parseFloat(nutrition.settings.netWeight) : null,
      unitsPerBatch: nutrition.settings.unitsPerBatch ? parseFloat(nutrition.settings.unitsPerBatch) : null,
      productName,
    });
  }, [nutrition.recipe, nutrition.ingredients, nutrition.settings, productName]);

  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [spec, setSpec] = useState<SpecData | null>(null);
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [packShotPath, setPackShotPath] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Errors are shown where they happen — a failed pack-shot upload or lab-report
  // read is metres away from the save button at the bottom of a long form.
  const [error, setError] = useState("");        // save / PDF
  const [shotError, setShotError] = useState("");
  const [microError, setMicroError] = useState("");
  // Micro extraction review
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedMicro[] | null>(null);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const initialised = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialise once both the org and the recipe calc are ready — defaults are
  // derived from the recipe (allergens, net weight), then overlaid with the
  // saved row so later-added fields still get sensible values.
  useEffect(() => {
    if (initialised.current || !orgId || nutrition.loading) return;
    initialised.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";

      const [row, companyRes] = await Promise.all([
        loadSpecRow(orgId, productName),
        loadCompanyDetails(orgId, orgName ?? ""),
      ]);
      if (row.tableMissing || companyRes.tableMissing) { setTableMissing(true); setLoading(false); return; }

      const defaults = defaultSpecData({
        productName,
        orgName: orgName ?? "",
        userName,
        netWeight: nutrition.settings.netWeight,
        contains: result.contains,
        mayContain: result.mayContain,
        primaryPackaging: [nutrition.packaging.jar, nutrition.packaging.closure].filter((x): x is string => !!x),
      });
      setSpec(mergeSpecData(defaults, row.data));
      setPackShotPath(row.packShotPath);
      setCompany(companyRes.company);
      setLoading(false);
    })();
  }, [orgId, orgName, nutrition, result, productName]);

  function patchSpec(patch: Partial<SpecData>) {
    setSpec(s => (s ? { ...s, ...patch } : s));
    setSaved(false);
  }

  /** Save every key this tab owns — never `organoleptic`, which the Organoleptic tab owns. */
  async function save(shot?: string | null): Promise<boolean> {
    if (!orgId || !spec) return false;
    setSaving(true);
    setError("");
    const { organoleptic: _ownedElsewhere, ...mine } = spec;
    const res = await saveSpecPatch(orgId, productName, mine, shot !== undefined ? shot : packShotPath);
    setSaving(false);
    if (res.error) { setError("Failed to save: " + res.error); return false; }
    setSaved(true);
    return true;
  }

  async function handlePackShot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (!PACK_SHOT_ACCEPT.test(file.name)) {
      setShotError("The pack shot must be a PNG or JPEG (the PDF can't embed other formats).");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploadingShot(true);
    setShotError("");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeProduct = productName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `spec-sheets/${orgId}/${safeProduct}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("compliance-docs")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      setShotError("Pack shot upload failed: " + uploadError.message);
      setUploadingShot(false);
      return;
    }
    if (packShotPath) await supabase.storage.from("compliance-docs").remove([packShotPath]);
    setPackShotPath(path);
    setSaved(false);
    setUploadingShot(false);
  }

  /** Read the product's lab reports and offer the micro limits for review. */
  async function pullMicroFromLabReports() {
    setExtracting(true);
    setMicroError("");
    setExtracted(null);
    setExtractWarnings([]);
    try {
      const res = await fetch("/api/extract-micro-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMicroError(body.error || "Couldn't read the lab reports.");
        setExtracting(false);
        return;
      }
      const tests = (body.extraction?.tests ?? []) as Omit<ExtractedMicro, "use">[];
      if (tests.length === 0) {
        setMicroError("No microbiological results found in the lab reports for this product.");
        setExtracting(false);
        return;
      }
      // Pre-tick only rows that actually carry a limit — a result with no
      // stated limit isn't a specification and shouldn't land in the table
      // unreviewed.
      setExtracted(tests.map(t => ({ ...t, use: Boolean(t.target?.trim()) })));
      setExtractWarnings((body.extraction?.warnings ?? []) as string[]);
    } catch {
      setMicroError("Couldn't read the lab reports — try again in a moment.");
    }
    setExtracting(false);
  }

  /** Replace the micro table with the ticked extracted rows. */
  function applyExtracted() {
    if (!extracted || !spec) return;
    const rows: MicroRow[] = extracted
      .filter(e => e.use)
      .map(e => ({ test: e.test, target: e.target || e.result }));
    if (rows.length) patchSpec({ micro: rows });
    setExtracted(null);
    setExtractWarnings([]);
  }

  async function downloadPdf() {
    if (!spec || !company || !orgId) return;
    setGenerating(true);
    setError("");
    try {
      const ok = await save();
      if (!ok) { setGenerating(false); return; }

      // Re-read the row so the organoleptic standard is whatever the
      // Organoleptic tab last saved, not what was loaded when this tab opened.
      const fresh = await loadSpecRow(orgId, productName);
      const specForPdf: SpecData = { ...spec, organoleptic: { ...spec.organoleptic, ...(fresh.data.organoleptic ?? {}) } };

      const declarationParts: DeclarationPart[] = result.declaration.map(d => ({
        name: d.name,
        bold: d.allergens.length > 0,
        quidPercent: d.quid ? `${d.percent.toFixed(d.percent < 10 ? 1 : 0)}%` : "",
      }));
      const nutritionRows: NutritionRow[] = result.per100g
        ? NUTRITION_LABELS
            .filter(([k]) => NUTRIENT_KEYS.includes(k))
            .map(([k, label]) => ({ label, value: String(result.per100g![k] ?? "") }))
        : [];

      const [{ pdf }, mod] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/SpecSheetPDF"),
      ]);
      const SpecDoc = mod.SpecSheetDocument;
      const blob = await pdf(
        <SpecDoc
          productName={productName}
          company={company}
          spec={specForPdf}
          declarationParts={declarationParts}
          nutritionRows={nutritionRows}
          contains={result.contains}
          packShotUrl={packShotPath ? publicUrl(packShotPath) : null}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Product Spec ${productName} V${spec.version || "1"} ${todayUK().replace(/\//g, ".")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Couldn't generate the PDF: " + (e instanceof Error ? e.message : String(e)));
    }
    setGenerating(false);
  }

  if (loading || nutrition.loading) {
    return <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>;
  }
  if (tableMissing) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        Spec sheets need a one-off database update — run <code className="font-mono">add-spec-sheets.sql</code> in the Supabase SQL editor.
      </div>
    );
  }
  if (!spec || !company) return null;

  const organolepticSet = Object.values(spec.organoleptic).some(v => v.trim());

  const gaps: string[] = [];
  if (!result.declaration.length) gaps.push("No recipe found — the ingredient declaration will be blank. Build the production record's ingredients table first.");
  if (!result.per100g) gaps.push("Nutrition data is incomplete — the nutrition table will be left off. Fix the gaps on the Recipe & yields tab.");
  if (result.gaps.unmatched.length) gaps.push(`No raw material match (allergens unknown): ${result.gaps.unmatched.join(", ")}.`);
  if (!companyIsComplete(company)) gaps.push("Company details are incomplete — fill them in under Account → Company details (once, for every product).");
  if (!organolepticSet) gaps.push("No organoleptic standard set — add it on the Organoleptic tab and it appears here.");

  return (
    <div className="space-y-6">

      {gaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
          {gaps.map((g, i) => <p key={i} className="text-xs text-amber-800">{g}</p>)}
        </div>
      )}

      <Section
        title="Company information"
        action={<Link href="/account/company" className="text-xs font-medium text-brown hover:underline">Edit in Account →</Link>}
      >
        <div className="divide-y divide-gray-100">
          <PulledRow label="Supplier" value={company.supplierName} />
          <PulledRow label="Address" value={company.address} />
          <PulledRow label="Telephone" value={company.telephone} />
          <PulledRow label="Email" value={company.email} />
          <PulledRow label="Commercial" value={[company.commercial.name, company.commercial.phone, company.commercial.email].filter(Boolean).join(" · ")} />
          <PulledRow label="Technical" value={[company.technical.name, company.technical.phone, company.technical.email].filter(Boolean).join(" · ")} />
        </div>
      </Section>

      <Section title="Document control">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Reference" value={spec.reference} onChange={v => patchSpec({ reference: v })} />
          <Field label="Version" value={spec.version} onChange={v => patchSpec({ version: v })} />
          <Field label="Version date" value={spec.versionDate} onChange={v => patchSpec({ versionDate: v })} />
          <Field label="Issue date" value={spec.issueDate} onChange={v => patchSpec({ issueDate: v })} />
          <Field label="Product code" value={spec.productCode} onChange={v => patchSpec({ productCode: v })} placeholder="e.g. SAUCE01" />
          <Field label="Updated by" value={spec.updatedBy} onChange={v => patchSpec({ updatedBy: v })} />
          <div className="col-span-2 sm:col-span-1">
            <Field label="Authorised by" value={spec.authorisedBy} onChange={v => patchSpec({ authorisedBy: v })} />
          </div>
        </div>
      </Section>

      <Section title="Product details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Legal name" value={spec.legalName} onChange={v => patchSpec({ legalName: v })} />
          <Field label="Net quantity" value={spec.netQuantity} onChange={v => patchSpec({ netQuantity: v })} placeholder="e.g. 160g" />
          <div className="sm:col-span-2">
            <Field label="Product description" textarea value={spec.description} onChange={v => patchSpec({ description: v })} />
          </div>
          <Field label="Best before / use by" value={spec.bbeText} onChange={v => patchSpec({ bbeText: v })} placeholder="e.g. 12 months from manufacture" />
          <Field label="Date format" value={spec.bbeFormat} onChange={v => patchSpec({ bbeFormat: v })} />
          <Field label="Storage conditions" value={spec.storage} onChange={v => patchSpec({ storage: v })} />
          <div>
            <label className="label">Nutrition methodology</label>
            <select className="input" value={spec.methodology} onChange={e => patchSpec({ methodology: e.target.value })}>
              <option value="Calculated">Calculated</option>
              <option value="Analysis">Analysis</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Field label="Usage / cooking instructions" textarea value={spec.usage} onChange={v => patchSpec({ usage: v })} />
          </div>
        </div>
      </Section>

      <Section title="Allergens handled on site">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SPEC_ALLERGENS.map(a => {
            const checked = spec.handledOnSite.includes(a.key);
            const inRecipe = result.contains.includes(a.key);
            return (
              <label key={a.key} className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brown focus:ring-brand/40"
                  checked={checked}
                  onChange={e => patchSpec({
                    handledOnSite: e.target.checked
                      ? [...spec.handledOnSite, a.key].sort()
                      : spec.handledOnSite.filter(x => x !== a.key),
                  })}
                />
                {a.key}
                {inRecipe && <span className="badge bg-brand-cream text-brown">in recipe</span>}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Product suitability">
        <div className="space-y-2">
          {SUITABILITY_ROWS.map(r => {
            const v = spec.suitability[r.key] ?? { value: "", certification: "" };
            return (
              <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_1fr] gap-2 items-center">
                <span className="text-sm text-gray-800">{r.label}</span>
                <select
                  className="input"
                  value={v.value}
                  onChange={e => patchSpec({ suitability: { ...spec.suitability, [r.key]: { ...v, value: e.target.value as "yes" | "no" | "" } } })}
                >
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <input
                  type="text"
                  className="input"
                  placeholder="Certification"
                  value={v.certification}
                  onChange={e => patchSpec({ suitability: { ...spec.suitability, [r.key]: { ...v, certification: e.target.value } } })}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Microbiological targets"
        action={
          <button
            type="button"
            onClick={pullMicroFromLabReports}
            disabled={extracting}
            className="text-xs font-medium text-brown hover:underline disabled:opacity-50"
          >
            {extracting ? "Reading lab reports…" : "Read from lab reports"}
          </button>
        }
      >
        {extracted && (
          <div className="mb-4 rounded-lg border border-brand-light bg-brand-cream/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-brown uppercase tracking-wide">Found in your lab reports — tick what to use</p>
            {extractWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800">{w}</p>
            ))}
            <div className="space-y-1">
              {extracted.map((e, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brown focus:ring-brand/40"
                    checked={e.use}
                    onChange={ev => setExtracted(prev => prev!.map((x, j) => j === i ? { ...x, use: ev.target.checked } : x))}
                  />
                  <span className="font-medium">{e.test}</span>
                  <span className="text-gray-700">{e.target || <span className="text-gray-400">no limit stated</span>}</span>
                  {e.result && <span className="text-xs text-gray-400">result: {e.result}</span>}
                  {e.source && <span className="text-xs text-gray-400">· {e.source}</span>}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={applyExtracted} className="btn-primary text-sm">
                Use these
              </button>
              <button type="button" onClick={() => { setExtracted(null); setExtractWarnings([]); }} className="btn-ghost text-sm">
                Cancel
              </button>
              <span className="text-xs text-gray-400">Replaces the table below</span>
            </div>
          </div>
        )}
        {microError && <p className="text-sm text-red-500 mb-3">{microError}</p>}
        {spec.micro.length === 0 && !extracted && (
          <p className="text-sm text-gray-400 mb-3">
            No targets set. Read them from this product&apos;s lab reports, or add them below — the section is left off the PDF while it&apos;s empty.
          </p>
        )}
        <div className="space-y-2">
          {spec.micro.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="text" className="input" value={m.test}
                onChange={e => patchSpec({ micro: spec.micro.map((x, j) => j === i ? { ...x, test: e.target.value } : x) })} />
              <input type="text" className="input" value={m.target}
                onChange={e => patchSpec({ micro: spec.micro.map((x, j) => j === i ? { ...x, target: e.target.value } : x) })} />
              <button
                type="button"
                onClick={() => patchSpec({ micro: spec.micro.filter((_, j) => j !== i) })}
                className="text-gray-300 hover:text-red-500 transition text-base leading-none shrink-0"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patchSpec({ micro: [...spec.micro, { test: "", target: "" }] })}
            className="text-xs font-medium text-brown hover:underline"
          >
            + Add test
          </button>
        </div>
      </Section>

      <Section
        title="Organoleptic attributes"
        action={
          <Link href={`${pathname}?tab=organoleptic`} className="text-xs font-medium text-brown hover:underline">
            Edit on Organoleptic tab →
          </Link>
        }
      >
        <div className="divide-y divide-gray-100">
          <PulledRow label="Appearance" value={spec.organoleptic.appearance} />
          <PulledRow label="Aroma" value={spec.organoleptic.aroma} />
          <PulledRow label="Texture" value={spec.organoleptic.texture} />
          <PulledRow label="Flavour" value={spec.organoleptic.flavour} />
        </div>
      </Section>

      <Section title="Packaging">
        <div className="space-y-2">
          {spec.packaging.map((p, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-gray-700">{p.level}</span>
              <input type="text" className="input" placeholder="Material" value={p.material}
                onChange={e => patchSpec({ packaging: spec.packaging.map((x, j) => j === i ? { ...x, material: e.target.value } : x) })} />
              <input type="text" className="input" placeholder="Dimensions" value={p.dimensions}
                onChange={e => patchSpec({ packaging: spec.packaging.map((x, j) => j === i ? { ...x, dimensions: e.target.value } : x) })} />
              <input type="text" className="input" placeholder="Weight" value={p.weight}
                onChange={e => patchSpec({ packaging: spec.packaging.map((x, j) => j === i ? { ...x, weight: e.target.value } : x) })} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Pack shot"
        action={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingShot || !orgId}
            className="inline-flex items-center gap-1 text-xs font-medium text-brown hover:underline disabled:opacity-50"
          >
            {uploadingShot ? (
              <span className="animate-pulse">Uploading…</span>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v7M3 5l3-4 3 4M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"/>
                </svg>
                {packShotPath ? "Replace photo" : "Upload photo"}
              </>
            )}
          </button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handlePackShot}
        />
        {packShotPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicUrl(packShotPath)} alt="Pack shot" className="h-40 w-40 object-contain rounded-lg border border-gray-200 bg-white" />
        ) : (
          <p className="text-sm text-gray-400">No pack shot yet — upload a photo of the finished product as a PNG or JPEG.</p>
        )}
        {shotError && <p className="text-sm text-red-500 mt-2">{shotError}</p>}
      </Section>

      <Section title="Completed by">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" value={spec.completedBy.name} onChange={v => patchSpec({ completedBy: { ...spec.completedBy, name: v } })} />
          <Field label="On behalf of (company)" value={spec.completedBy.company} onChange={v => patchSpec({ completedBy: { ...spec.completedBy, company: v } })} />
          <Field label="Position in company" value={spec.completedBy.position} onChange={v => patchSpec({ completedBy: { ...spec.completedBy, position: v } })} />
          <Field label="Signature (typed)" value={spec.completedBy.signature} onChange={v => patchSpec({ completedBy: { ...spec.completedBy, signature: v } })} />
          <Field label="Date" value={spec.completedBy.date} onChange={v => patchSpec({ completedBy: { ...spec.completedBy, date: v } })} />
        </div>
      </Section>

      <Section title="Amendment log">
        <div className="space-y-2">
          {spec.amendments.map((a, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[7rem_1fr_5rem_1fr_auto] gap-2 items-center">
              <input type="text" className="input" placeholder="Date" value={a.date}
                onChange={e => patchSpec({ amendments: spec.amendments.map((x, j) => j === i ? { ...x, date: e.target.value } : x) })} />
              <input type="text" className="input" placeholder="Reason for change" value={a.reason}
                onChange={e => patchSpec({ amendments: spec.amendments.map((x, j) => j === i ? { ...x, reason: e.target.value } : x) })} />
              <input type="text" className="input" placeholder="Version" value={a.version}
                onChange={e => patchSpec({ amendments: spec.amendments.map((x, j) => j === i ? { ...x, version: e.target.value } : x) })} />
              <input type="text" className="input" placeholder="Updated by" value={a.updatedBy}
                onChange={e => patchSpec({ amendments: spec.amendments.map((x, j) => j === i ? { ...x, updatedBy: e.target.value } : x) })} />
              <button
                type="button"
                onClick={() => patchSpec({ amendments: spec.amendments.filter((_, j) => j !== i) })}
                className="text-gray-300 hover:text-red-500 transition text-base leading-none"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patchSpec({ amendments: [...spec.amendments, { date: todayUK(), reason: "", version: "", updatedBy: "" }] })}
            className="text-xs font-medium text-brown hover:underline"
          >
            + Add amendment
          </button>
        </div>
      </Section>

      <div className="flex items-center gap-3 pb-2">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || generating}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save spec sheet"}
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={saving || generating || uploadingShot}
          className="btn-secondary text-sm disabled:opacity-60"
        >
          {generating ? "Generating…" : "Download PDF"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
