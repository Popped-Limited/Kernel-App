"use client";

// Spec sheet tab — edits the per-product spec fields + org-level company
// details, then generates the Beacon-style Finished Product Specification PDF.
// Derived content (ingredient declaration, QUID, nutrition, allergens) is
// computed live from the recipe at download time via the same calc as the
// Declarations tab; only the non-derivable fields are stored.
//
// @react-pdf/renderer is heavy, so SpecSheetPDF is loaded via dynamic import()
// inside the download handler — never statically.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { useProductNutrition } from "@/components/useProductNutrition";
import { computeNutrition, NUTRIENT_KEYS, type CalcResult, type NutrientKey } from "@/lib/nutrition/recipe-calc";
import {
  type CompanyDetails, type SpecData,
  SPEC_ALLERGENS, SUITABILITY_ROWS,
  defaultCompanyDetails, defaultSpecData, mergeCompanyDetails, mergeSpecData, todayUK,
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

function publicUrl(path: string) {
  return supabase.storage.from("compliance-docs").getPublicUrl(path).data.publicUrl;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
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

export default function ProductSpecSheetPanel({ productName }: { productName: string }) {
  const { orgId, orgName } = useOrganisation();
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
  const [specId, setSpecId] = useState<string | null>(null);
  const [spec, setSpec] = useState<SpecData | null>(null);
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [packShotPath, setPackShotPath] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const initialised = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialise once both the org and the recipe calc are ready — defaults are
  // derived from the recipe (allergens, net weight), then overlaid with the
  // saved rows so later-added fields still get sensible values.
  useEffect(() => {
    if (initialised.current || !orgId || nutrition.loading) return;
    initialised.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";

      const esc = productName.replace(/[\\%_]/g, m => "\\" + m);
      const [specRes, companyRes] = await Promise.all([
        supabase.from("product_spec_sheets")
          .select("id, data, pack_shot_path")
          .eq("organisation_id", orgId)
          .ilike("product_name", esc)
          .maybeSingle(),
        supabase.from("spec_company_details")
          .select("data")
          .eq("organisation_id", orgId)
          .maybeSingle(),
      ]);

      // 42P01 = table doesn't exist yet (migration not run)
      if (specRes.error?.code === "42P01" || companyRes.error?.code === "42P01") {
        setTableMissing(true);
        setLoading(false);
        return;
      }

      const defaults = defaultSpecData({
        productName,
        orgName: orgName ?? "",
        userName,
        netWeight: nutrition.settings.netWeight,
        contains: result.contains,
        mayContain: result.mayContain,
        primaryPackaging: [nutrition.packaging.jar, nutrition.packaging.closure].filter((x): x is string => !!x),
      });
      setSpec(mergeSpecData(defaults, specRes.data?.data as Partial<SpecData> | null));
      setSpecId(specRes.data?.id ?? null);
      setPackShotPath(specRes.data?.pack_shot_path ?? null);
      setCompany(mergeCompanyDetails(defaultCompanyDetails(orgName ?? ""), companyRes.data?.data as Partial<CompanyDetails> | null));
      setLoading(false);
    })();
  }, [orgId, orgName, nutrition, result, productName]);

  function patchSpec(patch: Partial<SpecData>) {
    setSpec(s => (s ? { ...s, ...patch } : s));
    setSaved(false);
  }
  function patchCompany(patch: Partial<CompanyDetails>) {
    setCompany(c => (c ? { ...c, ...patch } : c));
    setSaved(false);
  }

  async function save(): Promise<boolean> {
    if (!orgId || !spec || !company) return false;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const by = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";
    const now = new Date().toISOString();

    const { error: companyError } = await supabase
      .from("spec_company_details")
      .upsert({ organisation_id: orgId, data: company, updated_by: by, updated_at: now }, { onConflict: "organisation_id" });
    if (companyError) {
      setError("Failed to save company details: " + companyError.message);
      setSaving(false);
      return false;
    }

    if (specId) {
      const { error: specError } = await supabase
        .from("product_spec_sheets")
        .update({ data: spec, pack_shot_path: packShotPath, updated_by: by, updated_at: now })
        .eq("id", specId);
      if (specError) {
        setError("Failed to save: " + specError.message);
        setSaving(false);
        return false;
      }
    } else {
      const { data: inserted, error: specError } = await supabase
        .from("product_spec_sheets")
        .insert({ organisation_id: orgId, product_name: productName, data: spec, pack_shot_path: packShotPath, updated_by: by, updated_at: now })
        .select("id")
        .single();
      if (specError) {
        setError("Failed to save: " + specError.message);
        setSaving(false);
        return false;
      }
      setSpecId(inserted?.id ?? null);
    }
    setSaving(false);
    setSaved(true);
    return true;
  }

  async function handlePackShot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (!PACK_SHOT_ACCEPT.test(file.name)) {
      setError("The pack shot must be a PNG or JPEG (the PDF can't embed other formats).");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploadingShot(true);
    setError("");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeProduct = productName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `spec-sheets/${orgId}/${safeProduct}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("compliance-docs")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      setError("Pack shot upload failed: " + uploadError.message);
      setUploadingShot(false);
      return;
    }
    // Replace: best-effort removal of the previous file
    if (packShotPath) await supabase.storage.from("compliance-docs").remove([packShotPath]);
    setPackShotPath(path);
    setSaved(false);
    setUploadingShot(false);
  }

  async function downloadPdf() {
    if (!spec || !company) return;
    setGenerating(true);
    setError("");
    try {
      // Persist first so the sheet on disk always matches a saved state
      const ok = await save();
      if (!ok) { setGenerating(false); return; }

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
          spec={spec}
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

  const gaps: string[] = [];
  if (!result.declaration.length) gaps.push("No recipe found — the ingredient declaration will be blank. Build the production record's ingredients table first.");
  if (!result.per100g) gaps.push("Nutrition data is incomplete — the nutrition table will be left off. Fix the gaps on the Recipe & yields tab.");
  if (result.gaps.unmatched.length) gaps.push(`No raw material match (allergens unknown): ${result.gaps.unmatched.join(", ")}.`);

  return (
    <div className="space-y-6">

      {gaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
          {gaps.map((g, i) => <p key={i} className="text-xs text-amber-800">{g}</p>)}
        </div>
      )}

      <Section title="Company information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier name" value={company.supplierName} onChange={v => patchCompany({ supplierName: v })} />
          <Field label="Telephone" value={company.telephone} onChange={v => patchCompany({ telephone: v })} />
          <div className="sm:col-span-2">
            <Field label="Address" textarea value={company.address} onChange={v => patchCompany({ address: v })} />
          </div>
          <Field label="Email" value={company.email} onChange={v => patchCompany({ email: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {(["commercial", "technical"] as const).map(kind => (
            <div key={kind} className="rounded-lg border border-gray-200 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{kind === "commercial" ? "Commercial contact" : "Technical contact"}</p>
              <Field label="Name" value={company[kind].name} onChange={v => patchCompany({ [kind]: { ...company[kind], name: v } } as Partial<CompanyDetails>)} />
              <Field label="Telephone" value={company[kind].phone} onChange={v => patchCompany({ [kind]: { ...company[kind], phone: v } } as Partial<CompanyDetails>)} />
              <Field label="Email" value={company[kind].email} onChange={v => patchCompany({ [kind]: { ...company[kind], email: v } } as Partial<CompanyDetails>)} />
            </div>
          ))}
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

      <Section title="Microbiological targets">
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

      <Section title="Organoleptic attributes">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Appearance" textarea value={spec.organoleptic.appearance} onChange={v => patchSpec({ organoleptic: { ...spec.organoleptic, appearance: v } })} />
          <Field label="Aroma" value={spec.organoleptic.aroma} onChange={v => patchSpec({ organoleptic: { ...spec.organoleptic, aroma: v } })} />
          <Field label="Texture" value={spec.organoleptic.texture} onChange={v => patchSpec({ organoleptic: { ...spec.organoleptic, texture: v } })} />
          <Field label="Flavour" value={spec.organoleptic.flavour} onChange={v => patchSpec({ organoleptic: { ...spec.organoleptic, flavour: v } })} />
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

      <Section title="Pack shot">
        <div className="flex items-start gap-4">
          {packShotPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={publicUrl(packShotPath)} alt="Pack shot" className="h-32 w-32 object-contain rounded-lg border border-gray-200 bg-white" />
          )}
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-cream file:px-3 file:py-2 file:text-sm file:font-medium file:text-brown hover:file:bg-brand-light"
              onChange={handlePackShot}
              disabled={uploadingShot}
            />
            {uploadingShot && <p className="text-xs text-gray-400">Uploading…</p>}
          </div>
        </div>
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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pb-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || generating}
          className="rounded-lg bg-brown px-3.5 py-2 text-sm font-medium text-white hover:bg-brown/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={saving || generating || uploadingShot}
          className="rounded-lg border border-brown px-3.5 py-2 text-sm font-medium text-brown hover:bg-brand-cream disabled:opacity-50"
        >
          {generating ? "Generating…" : "Download spec sheet PDF"}
        </button>
      </div>
    </div>
  );
}
