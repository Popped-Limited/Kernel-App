"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Ingredient } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type CCPType = "number" | "text" | "checkbox";

interface CCP {
  label: string;
  type: CCPType;
}

interface SelectedIngredient {
  id: string;
  name: string;
  unit: "g" | "units";
  targetWeight: string; // grams as string
}

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Product" },
  { n: 2, label: "Ingredients" },
  { n: 3, label: "CCPs" },
  { n: 4, label: "Packaging" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductionBuilderPage() {
  const router = useRouter();
  const { orgId } = useOrganisation();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 — ingredients
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loadingIngs, setLoadingIngs] = useState(true);
  const [selected, setSelected] = useState<Record<string, SelectedIngredient>>({});

  // Step 3 — CCPs
  const [ccps, setCcps] = useState<CCP[]>([{ label: "", type: "number" }]);

  // Step 4 — packaging
  const [unitLabel, setUnitLabel] = useState("jar");
  const [closureLabel, setClosureLabel] = useState("lid");
  const [includeTotalUnits, setIncludeTotalUnits] = useState(true);
  const [signOffType, setSignOffType] = useState<"signature" | "checkbox">("signature");

  useEffect(() => {
    supabase
      .from("ingredients")
      .select("*")
      .eq("type", "ingredient")
      .order("name")
      .then(({ data }) => {
        setAllIngredients((data ?? []) as Ingredient[]);
        setLoadingIngs(false);
      });
  }, []);

  // ── Step navigation ─────────────────────────────────────────────────────────

  function validateStep(): string {
    if (step === 1) {
      if (!productName.trim()) return "Product name is required.";
    }
    if (step === 2) {
      const sel = Object.values(selected);
      if (sel.length === 0) return "Select at least one ingredient.";
      for (const s of sel) {
        if (s.unit === "g" && (!s.targetWeight || isNaN(Number(s.targetWeight)) || Number(s.targetWeight) <= 0)) {
          return `Enter a target weight for ${s.name}.`;
        }
      }
    }
    if (step === 3) {
      for (const ccp of ccps) {
        if (!ccp.label.trim()) return "Fill in all CCP labels, or remove empty ones.";
      }
    }
    if (step === 4) {
      if (!unitLabel.trim()) return "Enter a packaging unit label.";
      if (!closureLabel.trim()) return "Enter a closure label.";
    }
    return "";
  }

  function next() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
  }

  function back() {
    setError("");
    setStep((s) => s - 1);
  }

  // ── Toggle / update ingredient selection ─────────────────────────────────────

  function toggleIngredient(ing: Ingredient) {
    setSelected((prev) => {
      if (prev[ing.id]) {
        const next = { ...prev };
        delete next[ing.id];
        return next;
      }
      return {
        ...prev,
        [ing.id]: { id: ing.id, name: ing.name, unit: ing.unit, targetWeight: "" },
      };
    });
  }

  function updateTarget(id: string, value: string) {
    setSelected((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], targetWeight: value } } : prev);
  }

  // ── CCP helpers ──────────────────────────────────────────────────────────────

  function addCCP() {
    setCcps((c) => [...c, { label: "", type: "number" }]);
  }

  function removeCCP(idx: number) {
    setCcps((c) => c.filter((_, i) => i !== idx));
  }

  function updateCCP(idx: number, field: keyof CCP, value: string) {
    setCcps((c) => c.map((ccp, i) => i === idx ? { ...ccp, [field]: value } : ccp));
  }

  // ── Create checklist ─────────────────────────────────────────────────────────

  async function create() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    const checklistName = `${productName.trim()} — Production Record`;

    // 1. Create checklist
    const { data: cl, error: clErr } = await supabase
      .from("checklists")
      .insert({
        name: checklistName,
        frequency: "per_batch",
        category: "Production",
        description: description.trim() || null,
        active: true,
        organisation_id: orgId,
      })
      .select("id")
      .single();

    if (clErr || !cl) {
      setError(clErr?.message ?? "Failed to create checklist.");
      setSaving(false);
      return;
    }

    const checklistId = cl.id;

    // 2. Build questions array
    const questions: Array<{
      checklist_id: string;
      label: string;
      type: string;
      required: boolean;
      order_index: number;
      options: string[] | null;
      hint: string | null;
      organisation_id: string | null;
    }> = [];

    let idx = 0;

    // Standard header questions
    questions.push({
      checklist_id: checklistId,
      label: "Operator name",
      type: "text",
      required: true,
      order_index: idx++,
      options: null,
      hint: null,
      organisation_id: orgId,
    });

    questions.push({
      checklist_id: checklistId,
      label: "Production date",
      type: "date",
      required: true,
      order_index: idx++,
      options: null,
      hint: null,
      organisation_id: orgId,
    });

    // Ingredient table
    const ingredientOptions = Object.values(selected).map(
      (s) => `${s.name}|${s.unit === "g" ? s.targetWeight : "0"}`
    );

    questions.push({
      checklist_id: checklistId,
      label: "Ingredients used",
      type: "ingredient_table",
      required: true,
      order_index: idx++,
      options: ingredientOptions,
      hint: null,
      organisation_id: orgId,
    });

    // CCPs
    for (const ccp of ccps) {
      if (!ccp.label.trim()) continue;
      questions.push({
        checklist_id: checklistId,
        label: ccp.label.trim(),
        type: ccp.type,
        required: true,
        order_index: idx++,
        options: null,
        hint: null,
        organisation_id: orgId,
      });
    }

    // Packing log — store unit/closure labels in hint as JSON
    const packingHint = JSON.stringify({ unit: unitLabel.trim(), closure: closureLabel.trim() });
    questions.push({
      checklist_id: checklistId,
      label: "Packing log",
      type: "packing_runs",
      required: true,
      order_index: idx++,
      options: null,
      hint: packingHint,
      organisation_id: orgId,
    });

    // Total units
    if (includeTotalUnits) {
      questions.push({
        checklist_id: checklistId,
        label: "Total units produced",
        type: "number",
        required: true,
        order_index: idx++,
        options: null,
        hint: null,
        organisation_id: orgId,
      });
    }

    // Sign-off
    questions.push({
      checklist_id: checklistId,
      label: signOffType === "signature" ? "Supervisor sign-off" : "Quality check confirmed",
      type: signOffType,
      required: true,
      order_index: idx++,
      options: null,
      hint: signOffType === "checkbox" ? "Tick to confirm all checks are complete and the batch is approved for packing." : null,
      organisation_id: orgId,
    });

    // 3. Insert all questions
    const { error: qErr } = await supabase.from("questions").insert(questions);

    if (qErr) {
      // Rollback checklist
      await supabase.from("checklists").delete().eq("id", checklistId);
      setError(qErr.message);
      setSaving(false);
      return;
    }

    // Done — go to the checklist editor
    router.push(`/admin/checklists/${checklistId}`);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Create Production Run</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Build a custom production batch checklist with ingredients, CCPs and packing log.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step > s.n
                  ? "bg-brand-dark text-white"
                  : step === s.n
                  ? "bg-brand text-brown border-2 border-brand-dark"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {step > s.n ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.n}
              </div>
              <span className={`mt-1 text-xs font-medium ${step === s.n ? "text-brown" : "text-gray-400"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 mx-1 mb-4 transition-colors ${step > s.n ? "bg-brand-dark" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card p-6 space-y-5">

        {/* ── Step 1: Product ── */}
        {step === 1 && (
          <>
            <div>
              <label className="label">Product name <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Sichuan Chilli Oil"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                The checklist will be saved as &ldquo;{productName.trim() || "Product name"} — Production Record&rdquo;.
              </p>
            </div>
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief instructions shown at the top of the batch form…"
              />
            </div>
          </>
        )}

        {/* ── Step 2: Ingredients ── */}
        {step === 2 && (
          <>
            <p className="text-sm font-semibold text-gray-700">
              Select the ingredients used in this product and enter a target weight for each.
            </p>
            {loadingIngs ? (
              <p className="text-sm text-gray-400">Loading ingredients…</p>
            ) : allIngredients.length === 0 ? (
              <p className="text-sm text-gray-400">
                No ingredients found. Add them under{" "}
                <a href="/admin/stock" className="underline text-brown">Raw Materials</a> first.
              </p>
            ) : (
              <div className="space-y-2">
                {allIngredients.map((ing) => {
                  const isSelected = !!selected[ing.id];
                  return (
                    <div
                      key={ing.id}
                      className={`rounded-xl border p-3 transition cursor-pointer ${
                        isSelected ? "border-brand/50 bg-brand/5" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox toggle */}
                        <button
                          type="button"
                          onClick={() => toggleIngredient(ing)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                            isSelected ? "border-brand-dark bg-brand-dark" : "border-gray-300"
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleIngredient(ing)}
                          className="flex-1 text-left text-sm font-medium text-gray-900"
                        >
                          {ing.name}
                        </button>

                        {/* Target weight input */}
                        {isSelected && ing.unit === "g" && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              value={selected[ing.id]?.targetWeight ?? ""}
                              onChange={(e) => updateTarget(ing.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="input w-28 py-1.5 text-sm text-right"
                              placeholder="Target (g)"
                              inputMode="decimal"
                              min="0"
                            />
                            <span className="text-xs text-gray-400">g</span>
                          </div>
                        )}
                        {isSelected && ing.unit === "units" && (
                          <span className="text-xs text-gray-400 shrink-0">units (no weight target)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400">
              {Object.keys(selected).length} ingredient{Object.keys(selected).length !== 1 ? "s" : ""} selected
            </p>
          </>
        )}

        {/* ── Step 3: CCPs ── */}
        {step === 3 && (
          <>
            <p className="text-sm font-semibold text-gray-700">
              Add your critical control points (CCPs). These appear as questions on the batch form.
            </p>
            <div className="space-y-3">
              {ccps.map((ccp, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 w-16 shrink-0">CCP {idx + 1}</span>
                    <select
                      value={ccp.type}
                      onChange={(e) => updateCCP(idx, "type", e.target.value)}
                      className="input py-1.5 text-sm flex-shrink-0 w-32"
                    >
                      <option value="number">Number</option>
                      <option value="text">Text</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCCP(idx)}
                      className="ml-auto text-gray-300 hover:text-red-500 transition p-1"
                      title="Remove"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
                      </svg>
                    </button>
                  </div>
                  <input
                    className="input text-sm"
                    value={ccp.label}
                    onChange={(e) => updateCCP(idx, "label", e.target.value)}
                    placeholder={
                      ccp.type === "number" ? "e.g. Oil temperature (°C)"
                      : ccp.type === "checkbox" ? "e.g. Allergen check completed"
                      : "e.g. CCP label"
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addCCP}
              className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand transition"
            >
              + Add CCP
            </button>
            <p className="text-xs text-gray-400">
              You can also skip CCPs for now and add them later via the checklist editor.
            </p>
          </>
        )}

        {/* ── Step 4: Packaging ── */}
        {step === 4 && (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Packaging terminology</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Container / unit name</label>
                  <input
                    className="input"
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    placeholder="e.g. jar, bottle, tub"
                  />
                </div>
                <div>
                  <label className="label">Closure / seal name</label>
                  <input
                    className="input"
                    value={closureLabel}
                    onChange={(e) => setClosureLabel(e.target.value)}
                    placeholder="e.g. lid, seal, cap"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                The packing log will use these labels (e.g. &ldquo;No. of {unitLabel || "jars"}&rdquo;, &ldquo;{closureLabel || "lid"} batch no.&rdquo;).
              </p>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Completion fields</p>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm text-gray-800">Total units produced</p>
                  <p className="text-xs text-gray-400">A number field at the end of the form</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeTotalUnits((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${includeTotalUnits ? "bg-brand-dark" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${includeTotalUnits ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              <div>
                <label className="label">Sign-off type</label>
                <div className="flex gap-2">
                  {(["signature", "checkbox"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSignOffType(t)}
                      className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition ${
                        signOffType === t
                          ? "border-brand-dark bg-brand/10 text-brown"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {t === "signature" ? "Signature" : "Checkbox"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Summary</p>
              <SummaryRow label="Product" value={`${productName.trim()} — Production Record`} />
              <SummaryRow label="Ingredients" value={`${Object.keys(selected).length} selected`} />
              <SummaryRow label="CCPs" value={`${ccps.filter((c) => c.label.trim()).length}`} />
              <SummaryRow label="Packing unit" value={unitLabel || "jar"} />
              <SummaryRow label="Closure" value={closureLabel || "lid"} />
              <SummaryRow label="Total units field" value={includeTotalUnits ? "Yes" : "No"} />
              <SummaryRow label="Sign-off" value={signOffType === "signature" ? "Signature" : "Checkbox"} />
            </div>
          </>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button type="button" onClick={back} className="btn-ghost">
              ← Back
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button type="button" onClick={next} className="btn-primary">
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Creating…" : "Create production run →"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
