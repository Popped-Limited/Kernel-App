"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { useGuidedTour } from "@/lib/useGuidedTour";
import type { Ingredient } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ControlPointType = "number" | "text" | "checkbox";

interface ControlPoint {
  label: string;
  hint: string;     // guidance shown under the question on the form
  type: ControlPointType;
}

interface SelectedIngredient {
  id: string;
  name: string;
  unit: "g" | "units";
  targetWeight: string;
}

interface InspectionItem {
  label: string;
  hint: string;
  type: "checkbox" | "dropdown" | "text";
  options: string[] | null;
  required: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simplePlural(word: string): string {
  if (!word) return "";
  return word.toLowerCase().endsWith("s") ? word : word + "s";
}

function emptyCP(): ControlPoint {
  return { label: "", hint: "", type: "number" };
}

// ─── Preset inspection checks ─────────────────────────────────────────────────

const INSPECTION_PRESETS: { id: string; item: InspectionItem }[] = [
  {
    id: "glass_check",
    item: {
      label: "Glass check inspection completed?",
      hint: "",
      type: "dropdown",
      options: ["Completed", "Not applicable"],
      required: true,
    },
  },
  {
    id: "containers_intact",
    item: {
      label: "All containers intact?",
      hint: "",
      type: "dropdown",
      options: ["Yes", "No"],
      required: true,
    },
  },
  {
    id: "not_intact_count",
    item: {
      label: "If any containers not intact — how many?",
      hint: "Leave blank if all containers intact",
      type: "text",
      options: null,
      required: false,
    },
  },
  {
    id: "label_verified",
    item: {
      label: "Labelling verified — correct batch code and best before date confirmed on label",
      hint: "",
      type: "checkbox",
      options: null,
      required: true,
    },
  },
];

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Product" },
  { n: 2, label: "Ingredients" },
  { n: 3, label: "Control Points" },
  { n: 4, label: "Quality" },
  { n: 5, label: "Packaging" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionBuilderPage() {
  const router = useRouter();
  const { orgId } = useOrganisation();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — Product
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [includeBatchCode, setIncludeBatchCode] = useState(true);

  // Step 2 — Ingredients
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loadingIngs, setLoadingIngs] = useState(true);
  const [selected, setSelected] = useState<Record<string, SelectedIngredient>>({});

  // Step 3 — Control Points
  const [ccps, setCcps] = useState<ControlPoint[]>([emptyCP()]);
  const [cps, setCps] = useState<ControlPoint[]>([]);
  const [includeCorrectiveAction, setIncludeCorrectiveAction] = useState(true);

  // Step 4 — Quality
  const [includeWeightChecks, setIncludeWeightChecks] = useState(true);
  const [tareSampleCount, setTareSampleCount] = useState(5);      // tare weight samples (1–5)
  const [finishedCheckCount, setFinishedCheckCount] = useState(3); // finished-product checks per stage (1–5)
  const [inspectionToggles, setInspectionToggles] = useState<Record<string, boolean>>({
    glass_check: true,
    containers_intact: true,
    not_intact_count: true,
    label_verified: true,
  });
  const [customInspections, setCustomInspections] = useState<InspectionItem[]>([]);

  // Step 5 — Packaging
  const [unitLabel, setUnitLabel] = useState("jar");
  const [closureLabel, setClosureLabel] = useState("lid");
  const [packingLogHint, setPackingLogHint] = useState("");
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

  useGuidedTour({
    tourKey: "production",
    ready: true,
    orgId,
    steps: [
      {
        element: '[data-tour="prod-steps"]',
        popover: {
          title: "Build a production record",
          description:
            "This 5-step wizard creates a reusable production checklist: Product, Ingredients, Control points, Quality and Packaging.",
          side: "bottom",
        },
      },
      {
        element: '[data-tour="prod-name"]',
        popover: {
          title: "Name your product",
          description: "Start by naming what you're making — e.g. \"Sichuan Chilli Oil\".",
          side: "bottom",
        },
      },
      {
        element: '[data-tour="prod-next"]',
        popover: {
          title: "Work through each step",
          description:
            "Fill each step and hit Next. On the last step you'll create the record — it then appears as a checklist your team fills in for every batch.",
          side: "left",
        },
      },
    ],
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  function validateStep(): string {
    if (step === 1 && !productName.trim()) return "Product name is required.";
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
      for (const cp of cps) {
        if (!cp.label.trim()) return "Fill in all CP labels, or remove empty ones.";
      }
    }
    if (step === 5) {
      if (!unitLabel.trim()) return "Enter a container unit label (e.g. jar).";
      if (!closureLabel.trim()) return "Enter a closure label (e.g. lid).";
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

  // ── Ingredient helpers ───────────────────────────────────────────────────────

  function toggleIngredient(ing: Ingredient) {
    setSelected((prev) => {
      if (prev[ing.id]) {
        const next = { ...prev };
        delete next[ing.id];
        return next;
      }
      return { ...prev, [ing.id]: { id: ing.id, name: ing.name, unit: ing.unit, targetWeight: "" } };
    });
  }

  function updateTarget(id: string, value: string) {
    setSelected((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], targetWeight: value } } : prev);
  }

  // ── CCP / CP helpers ─────────────────────────────────────────────────────────

  function updateCP(list: ControlPoint[], setList: React.Dispatch<React.SetStateAction<ControlPoint[]>>, idx: number, field: keyof ControlPoint, value: string) {
    setList(list.map((cp, i) => i === idx ? { ...cp, [field]: value } : cp));
  }

  function removeCP(list: ControlPoint[], setList: React.Dispatch<React.SetStateAction<ControlPoint[]>>, idx: number) {
    setList(list.filter((_, i) => i !== idx));
  }

  // ── Create checklist ──────────────────────────────────────────────────────────

  async function create() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    const checklistName = `${productName.trim()} — Production Record`;

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
    type QRow = {
      checklist_id: string;
      label: string;
      type: string;
      required: boolean;
      order_index: number;
      options: string[] | null;
      hint: string | null;
      organisation_id: string | null;
    };

    const questions: QRow[] = [];
    let idx = 0;

    const q = (label: string, type: string, required: boolean, options: string[] | null = null, hint: string | null = null): QRow => ({
      checklist_id: checklistId,
      label,
      type,
      required,
      order_index: idx++,
      options,
      hint,
      organisation_id: orgId,
    });

    // ── Header ──
    if (includeBatchCode) {
      questions.push(q("Batch code", "text", true, null, "Assign a unique batch code for this production run"));
    }
    questions.push(q("Operator name", "text", true));
    questions.push(q("Production date", "date", true));

    // ── Ingredients ──
    const ingredientOptions = Object.values(selected).map(
      (s) => `${s.name}|${s.unit === "g" ? s.targetWeight : "0"}`
    );
    questions.push(q("Ingredients used", "ingredient_table", true, ingredientOptions));

    // ── Weight checks ──
    if (includeWeightChecks) {
      const unitCap = unitLabel ? unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1) : "Container";
      const closureCap = closureLabel ? closureLabel.charAt(0).toUpperCase() + closureLabel.slice(1) : "Lid";
      questions.push(q(
        `Packaging tare weight samples — ${tareSampleCount} ${unitCap} & ${closureCap} measurements (g)`,
        "multi_number",
        true,
        [String(tareSampleCount)],
        `Weigh ${tareSampleCount} ${simplePlural(unitLabel)} and enter each measurement`
      ));
      questions.push(q(
        "Tare weight used (g)",
        "number",
        true,
        null,
        `Use the lightest of the ${tareSampleCount} samples above`
      ));
      questions.push(q("Finished product weight — Start of run (g)", "multi_number", true, [String(finishedCheckCount)]));
      questions.push(q("Finished product weight — Middle of run (g)", "multi_number", true, [String(finishedCheckCount)]));
      questions.push(q("Finished product weight — End of run (g)", "multi_number", true, [String(finishedCheckCount)]));
    }

    // ── CCPs ──
    for (const ccp of ccps) {
      if (!ccp.label.trim()) continue;
      questions.push(q(ccp.label.trim(), ccp.type, true, null, ccp.hint.trim() || null));
    }

    // ── CPs ──
    for (const cp of cps) {
      if (!cp.label.trim()) continue;
      questions.push(q(cp.label.trim(), cp.type, true, null, cp.hint.trim() || null));
    }

    // ── Corrective action ──
    if (includeCorrectiveAction && (ccps.some(c => c.label.trim()) || cps.some(c => c.label.trim()))) {
      questions.push(q(
        "Corrective action taken (if any)",
        "text",
        false,
        null,
        "Describe any corrective actions taken. Leave blank if none required."
      ));
    }

    // ── Inspection ──
    for (const preset of INSPECTION_PRESETS) {
      if (!inspectionToggles[preset.id]) continue;
      const item = preset.item;
      questions.push(q(item.label, item.type, item.required, item.options, item.hint || null));
    }
    for (const custom of customInspections) {
      if (!custom.label.trim()) continue;
      questions.push(q(custom.label.trim(), custom.type, custom.required, custom.options, custom.hint || null));
    }

    // ── Packing log ──
    const hint = packingLogHint.trim()
      ? JSON.stringify({ unit: unitLabel.trim(), closure: closureLabel.trim(), hint: packingLogHint.trim() })
      : JSON.stringify({ unit: unitLabel.trim(), closure: closureLabel.trim() });
    questions.push(q("Packing log", "packing_runs", true, null, hint));

    // ── Total units ──
    if (includeTotalUnits) {
      questions.push(q("Total units produced", "number", true));
    }

    // ── Sign-off ──
    questions.push(q(
      signOffType === "signature" ? "Supervisor sign-off" : "Quality check confirmed",
      signOffType,
      true,
      null,
      signOffType === "checkbox" ? "Tick to confirm all checks are complete and the batch is approved." : null
    ));

    const { error: qErr } = await supabase.from("questions").insert(questions);
    if (qErr) {
      await supabase.from("checklists").delete().eq("id", checklistId);
      setError(qErr.message);
      setSaving(false);
      return;
    }

    router.push(`/admin/checklists/${checklistId}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Create Production Run</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Build a production batch checklist with ingredients, CCPs, weight checks and packing log.
        </p>
      </div>

      {/* Step indicator */}
      <div data-tour="prod-steps" className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step > s.n ? "bg-brand-dark text-white"
                : step === s.n ? "bg-brand text-brown border-2 border-brand-dark"
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
              <div className={`h-0.5 w-6 mx-0.5 mb-4 transition-colors ${step > s.n ? "bg-brand-dark" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-5">

        {/* ── Step 1: Product ── */}
        {step === 1 && (
          <>
            <div>
              <label className="label">Product name <span className="text-red-500">*</span></label>
              <input
                data-tour="prod-name"
                className="input"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Sichuan Chilli Oil"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Saved as &ldquo;{productName.trim() || "Product name"} — Production Record&rdquo;
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
            <Toggle
              label="Include batch code field"
              description="Adds a unique batch code field at the top of the form"
              value={includeBatchCode}
              onChange={setIncludeBatchCode}
            />
          </>
        )}

        {/* ── Step 2: Ingredients ── */}
        {step === 2 && (
          <>
            <p className="text-sm font-semibold text-gray-700">
              Select ingredients used in this product and enter a target weight.
            </p>
            {loadingIngs ? (
              <p className="text-sm text-gray-400">Loading ingredients…</p>
            ) : allIngredients.length === 0 ? (
              <p className="text-sm text-gray-400">
                No ingredients found. Add them under{" "}
                <a href="/compliance/raw-materials" className="underline text-brown">Raw Materials</a> first.
              </p>
            ) : (
              <div className="space-y-2">
                {allIngredients.map((ing) => {
                  const isSel = !!selected[ing.id];
                  return (
                    <div
                      key={ing.id}
                      className={`rounded-xl border p-3 transition ${isSel ? "border-brand/50 bg-brand/5" : "border-gray-200 bg-white hover:border-gray-300"}`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleIngredient(ing)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${isSel ? "border-brand-dark bg-brand-dark" : "border-gray-300"}`}
                        >
                          {isSel && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <button type="button" onClick={() => toggleIngredient(ing)} className="flex-1 text-left text-sm font-medium text-gray-900">
                          {ing.name}
                        </button>
                        {isSel && ing.unit === "g" && (
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
                        {isSel && ing.unit === "units" && (
                          <span className="text-xs text-gray-400 shrink-0">units</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400">{Object.keys(selected).length} ingredient{Object.keys(selected).length !== 1 ? "s" : ""} selected</p>
          </>
        )}

        {/* ── Step 3: Control Points ── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* CCPs */}
            <ControlPointSection
              title="Critical Control Points (CCPs)"
              description="Measurements that must be within safe limits — e.g. cooking temperature, hot fill temperature."
              items={ccps}
              onAdd={() => setCcps((c) => [...c, emptyCP()])}
              onRemove={(i) => removeCP(ccps, setCcps, i)}
              onUpdate={(i, f, v) => updateCP(ccps, setCcps, i, f, v)}
            />

            {/* CPs */}
            <ControlPointSection
              title="Control Points (CPs)"
              description="Important quality checks — e.g. pH, allergen check, metal detection."
              items={cps}
              onAdd={() => setCps((c) => [...c, emptyCP()])}
              onRemove={(i) => removeCP(cps, setCps, i)}
              onUpdate={(i, f, v) => updateCP(cps, setCps, i, f, v)}
              optional
            />

            {/* Corrective action */}
            <div className="border-t border-gray-100 pt-4">
              <Toggle
                label="Include corrective action field"
                description="Adds a free-text field after CCPs/CPs for recording any corrective actions taken"
                value={includeCorrectiveAction}
                onChange={setIncludeCorrectiveAction}
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Quality ── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Weight checks */}
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Weight checks</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Adds tare weight samples and finished product weight checks (start / middle / end of run)
                  </p>
                </div>
                <ToggleSwitch value={includeWeightChecks} onChange={setIncludeWeightChecks} />
              </div>

              {includeWeightChecks && (
                <div className="mt-4 space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-700">Tare weight samples</p>
                      <p className="text-xs text-gray-400 mt-0.5">How many containers to weigh for tare</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setTareSampleCount(n)}
                          className={`h-8 w-8 rounded-lg text-sm font-medium border transition ${tareSampleCount === n ? "border-brand-dark bg-brand-dark text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
                    <div>
                      <p className="text-sm text-gray-700">Finished product checks</p>
                      <p className="text-xs text-gray-400 mt-0.5">Measurements at each of start / middle / end of run</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFinishedCheckCount(n)}
                          className={`h-8 w-8 rounded-lg text-sm font-medium border transition ${finishedCheckCount === n ? "border-brand-dark bg-brand-dark text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Inspection checks */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-800 mb-1">Inspection checks</p>
              <p className="text-xs text-gray-500 mb-3">Toggle which inspection questions to include at the end of the form.</p>
              <div className="space-y-2">
                {INSPECTION_PRESETS.map((preset) => (
                  <div key={preset.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg border border-gray-100 bg-gray-50">
                    <span className="text-sm text-gray-700 flex-1 pr-4">{preset.item.label}</span>
                    <ToggleSwitch
                      value={!!inspectionToggles[preset.id]}
                      onChange={(v) => setInspectionToggles((t) => ({ ...t, [preset.id]: v }))}
                    />
                  </div>
                ))}
                {customInspections.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input flex-1 text-sm"
                      value={item.label}
                      onChange={(e) => setCustomInspections((ci) => ci.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Custom inspection label…"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomInspections((ci) => ci.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-500 p-1"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomInspections((ci) => [...ci, { label: "", hint: "", type: "checkbox", options: null, required: true }])}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand transition"
                >
                  + Add custom inspection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Packaging ── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Packaging labels</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Container / unit <span className="text-red-500">*</span></label>
                  <input className="input" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="jar, bottle, tub…" />
                </div>
                <div>
                  <label className="label">Closure / seal <span className="text-red-500">*</span></label>
                  <input className="input" value={closureLabel} onChange={(e) => setClosureLabel(e.target.value)} placeholder="lid, seal, cap…" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Used throughout the form — e.g. &ldquo;No. of {simplePlural(unitLabel || "jars")}&rdquo;, &ldquo;{closureLabel || "Lid"} batch no.&rdquo;
              </p>
            </div>

            <div>
              <label className="label">Packing log guidance <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                className="input"
                value={packingLogHint}
                onChange={(e) => setPackingLogHint(e.target.value)}
                placeholder={`Record each run with pack weight, ${simplePlural(unitLabel || "jar")} count, batch numbers and packer initials`}
              />
              <p className="text-xs text-gray-400 mt-1">Shown as a sub-heading under the packing log on the form.</p>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <Toggle
                label="Total units produced"
                description="Adds a number field after the packing log"
                value={includeTotalUnits}
                onChange={setIncludeTotalUnits}
              />
              <div>
                <label className="label">Sign-off type</label>
                <div className="flex gap-2">
                  {(["signature", "checkbox"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSignOffType(t)}
                      className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition ${
                        signOffType === t ? "border-brand-dark bg-brand/10 text-brown" : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {t === "signature" ? "Signature" : "Checkbox"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Form will include</p>
              {includeBatchCode && <SummaryRow label="Batch code" />}
              <SummaryRow label="Operator name + production date" />
              <SummaryRow label={`${Object.keys(selected).length} ingredient${Object.keys(selected).length !== 1 ? "s" : ""}`} />
              {includeWeightChecks && <SummaryRow label="Weight checks (tare + finished product)" />}
              {ccps.filter(c => c.label.trim()).length > 0 && <SummaryRow label={`${ccps.filter(c => c.label.trim()).length} CCP${ccps.filter(c => c.label.trim()).length !== 1 ? "s" : ""}`} />}
              {cps.filter(c => c.label.trim()).length > 0 && <SummaryRow label={`${cps.filter(c => c.label.trim()).length} CP${cps.filter(c => c.label.trim()).length !== 1 ? "s" : ""}`} />}
              {includeCorrectiveAction && <SummaryRow label="Corrective action field" />}
              {INSPECTION_PRESETS.filter(p => inspectionToggles[p.id]).length + customInspections.filter(c => c.label.trim()).length > 0 && (
                <SummaryRow label={`${INSPECTION_PRESETS.filter(p => inspectionToggles[p.id]).length + customInspections.filter(c => c.label.trim()).length} inspection checks`} />
              )}
              <SummaryRow label={`Packing log (${simplePlural(unitLabel || "jar")} + ${simplePlural(closureLabel || "lid")})`} />
              {includeTotalUnits && <SummaryRow label="Total units produced" />}
              <SummaryRow label={`Sign-off (${signOffType})`} />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {step > 1 && <button type="button" onClick={back} className="btn-ghost">← Back</button>}
          <div className="flex-1" />
          {step < STEPS.length ? (
            <button data-tour="prod-next" type="button" onClick={next} className="btn-primary">Next →</button>
          ) : (
            <button type="button" onClick={create} disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create production run →"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? "bg-brand-dark" : "bg-gray-300"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <ToggleSwitch value={value} onChange={onChange} />
    </div>
  );
}

function ControlPointSection({
  title, description, items, onAdd, onRemove, onUpdate, optional,
}: {
  title: string;
  description: string;
  items: ControlPoint[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof ControlPoint, value: string) => void;
  optional?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{description}</p>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 shrink-0 w-8">{idx + 1}</span>
              <select
                value={item.type}
                onChange={(e) => onUpdate(idx, "type", e.target.value)}
                className="input py-1.5 text-sm w-32 shrink-0"
              >
                <option value="number">Number</option>
                <option value="text">Text</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <button
                type="button"
                onClick={() => onRemove(idx)}
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
              value={item.label}
              onChange={(e) => onUpdate(idx, "label", e.target.value)}
              placeholder={item.type === "number" ? "e.g. Oil temperature (°C)" : item.type === "checkbox" ? "e.g. Allergen check completed" : "Label"}
            />
            <input
              className="input text-sm"
              value={item.hint}
              onChange={(e) => onUpdate(idx, "hint", e.target.value)}
              placeholder="Guidance text shown under the question (optional) — e.g. Must be ≥ 80°C for 5 seconds"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand transition"
      >
        + Add {optional ? "CP" : items.length === 0 ? "CCP" : "another CCP"}
      </button>
      {optional && items.length === 0 && (
        <p className="text-xs text-gray-400 mt-1 text-center">Optional — skip if no control points needed</p>
      )}
    </div>
  );
}

function SummaryRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <svg className="h-3.5 w-3.5 text-brand-dark shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {label}
    </div>
  );
}
