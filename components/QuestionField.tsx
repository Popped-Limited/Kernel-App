"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import type { Question, IngredientLot } from "@/lib/types";
import { todayJulianCode, formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

/** Local-state input for litres — lets the user type freely, converts to grams only on blur */
function LitresInput({ weightG, density, onChange }: { weightG: string; density: number; onChange: (g: string) => void }) {
  const [display, setDisplay] = useState(weightG ? (Number(weightG) / density).toFixed(2) : "");

  // Reset display if parent clears the value
  useEffect(() => {
    if (!weightG) setDisplay("");
  }, [weightG]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => setDisplay(e.target.value)}
      onBlur={(e) => {
        const litres = parseFloat(e.target.value);
        if (!isNaN(litres) && litres > 0) {
          onChange(String(Math.round(litres * density)));
          setDisplay(litres.toFixed(2));
        } else {
          onChange("");
          setDisplay("");
        }
      }}
      className="input w-24 shrink-0 text-sm py-1.5"
      placeholder="Litres"
    />
  );
}

interface Props {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  ingredientLots?: Record<string, IngredientLot[]>; // ingredient name → available lots
  densityByName?: Record<string, number>; // ingredient name → g/L
}

// Resolve a recipe ingredient name to a live ingredient key by EXACT name
// (case-insensitive, trimmed). No partial/substring matching: ingredient names
// can be very similar (e.g. "Long red chilli" vs "Red chilli powder"), so a
// loose match could silently link the wrong ingredient's batch codes/stock.
// If there's no exact match, nothing links and the user enters the code
// manually, or fixes the recipe name under Manage checklists.
function resolveKey(keys: string[], name: string): string | null {
  if (!name) return null;
  const lc = name.trim().toLowerCase();
  return keys.find(k => k.trim().toLowerCase() === lc) ?? null;
}

export function findLots(ingredientLots: Record<string, IngredientLot[]>, name: string): IngredientLot[] {
  const key = resolveKey(Object.keys(ingredientLots), name);
  return key ? ingredientLots[key] : [];
}

function findDensity(densityByName: Record<string, number>, name: string): number | null {
  const key = resolveKey(Object.keys(densityByName), name);
  return key != null ? densityByName[key] : null;
}

export default function QuestionField({ question, value, onChange, error, ingredientLots, densityByName }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Tracks raw litres/grams text per lot input so users can type freely without the field snapping
  const [litresDisplay, setLitresDisplay] = useState<Record<string, string>>({});
  const [gramsDisplay, setGramsDisplay]   = useState<Record<string, string>>({});
  const [pdfOpen, setPdfOpen] = useState(false);

  // Batches — only used by ingredient_table questions
  // Each batch has its own multiplier; combined target = sum of all multipliers
  const [batches, setBatches] = useState<Array<{ multiplier: number; input: string }>>(() => {
    // Restore saved batch multipliers from the draft value when the component first mounts
    if (!value) return [{ multiplier: 1, input: "1" }];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) && parsed?.batches?.length) return parsed.batches;
    } catch { /* ignore */ }
    return [{ multiplier: 1, input: "1" }];
  });
  const totalMultiplier = batches.reduce((sum, b) => sum + b.multiplier, 0);

  // Batch-record options — only used by batch_link questions. A production submission
  // each, labelled "Product — batch code · date", newest first.
  const [batchLinkOptions, setBatchLinkOptions] = useState<Array<{ id: string; product: string; code: string; label: string }>>([]);
  useEffect(() => {
    if (question.type !== "batch_link") return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id, submitted_at, checklist:checklists(name, category), answers(value, question:questions(type, label))")
        .order("submitted_at", { ascending: false })
        .limit(300);
      if (cancelled || !data) return;
      const opts: Array<{ id: string; product: string; code: string; label: string }> = [];
      for (const sub of data as unknown as Array<{ id: string; submitted_at: string; checklist: { name: string; category: string } | null; answers: Array<{ value: string | null; question: { type: string; label: string } | null }> }>) {
        const cl = sub.checklist;
        if (!cl || cl.category !== "Production") continue;
        const product = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
        let code = "";
        for (const a of sub.answers ?? []) {
          if (!a.value) continue;
          const lbl = (a.question?.label ?? "").toLowerCase();
          if (a.question?.type === "text" && a.value.trim() &&
              (lbl.includes("batch code") || lbl.includes("julian") || lbl.includes("batch ref") || lbl.includes("lot number"))) {
            code = a.value.trim();
            break;
          }
        }
        const date = formatDate(sub.submitted_at.slice(0, 10));
        opts.push({ id: sub.id, product, code, label: `${product} — ${code || "no batch code"} · ${date}` });
      }
      setBatchLinkOptions(opts);
    })();
    return () => { cancelled = true; };
  }, [question.type]);

  const base = (
    <div className="space-y-1">
      <label className="label">
        {question.label}
        {question.required && <span className="ml-1 text-brand">*</span>}
      </label>
      {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-1">{question.hint}</p>}
    </div>
  );

  const errMsg = error ? (
    <p className="mt-1 text-xs text-red-600">{error}</p>
  ) : null;

  if (question.type === "checkbox") {
    const checked = value === "true";
    return (
      <div>
        <button
          type="button"
          onClick={() => onChange(checked ? "false" : "true")}
          className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
            checked
              ? "border-brand bg-white"
              : "border-gray-200 bg-white hover:border-gray-300"
          } ${error ? "border-red-300" : ""}`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
              checked ? "border-brand bg-brand text-white" : "border-gray-300"
            }`}
          >
            {checked && (
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-900">{question.label}</span>
            {question.required && <span className="ml-1 text-brand text-xs">*</span>}
            {question.hint && <p className="mt-0.5 text-xs text-gray-500">{question.hint}</p>}
          </div>
        </button>
        {errMsg}
      </div>
    );
  }

  if (question.type === "dropdown") {
    return (
      <div>
        {base}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        >
          <option value="">Select…</option>
          {question.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {errMsg}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    // Answer format: JSON array of selected strings, OR { selected: string[], followUp: string }
    // when the question has a follow_up config. Handle both for backward compat.
    let selected: string[] = [];
    let followUpText = "";
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          selected = parsed;
        } else if (parsed && typeof parsed === "object") {
          selected = parsed.selected ?? [];
          followUpText = parsed.followUp ?? "";
        }
      } catch { /* ignore */ }
    }

    const followUpConfig = question.follow_up as { trigger: string; label: string } | null | undefined;
    const triggerActive = followUpConfig ? selected.includes(followUpConfig.trigger) : false;

    const emitChange = (nextSelected: string[], nextFollowUp: string) => {
      if (followUpConfig) {
        onChange(JSON.stringify({ selected: nextSelected, followUp: nextFollowUp }));
      } else {
        onChange(JSON.stringify(nextSelected));
      }
    };

    return (
      <div>
        {base}
        <div className="space-y-2">
          {question.options?.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  // Single-select when follow_up config exists (e.g. Yes/No), multi-select otherwise
                  const next = followUpConfig
                    ? (active ? [] : [opt])
                    : (active ? selected.filter((s) => s !== opt) : [...selected, opt]);
                  const nextFollowUp = followUpConfig && !next.includes(followUpConfig.trigger) ? "" : followUpText;
                  emitChange(next, nextFollowUp);
                }}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  active ? "border-brand/40 bg-brand/5 text-brand-dark font-medium" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {/* Circle indicator for single-select (follow_up), square for multi-select */}
                {followUpConfig ? (
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-brand bg-brand" : "border-gray-300"}`}>
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                ) : (
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${active ? "border-brand bg-brand" : "border-gray-300"}`}>
                    {active && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                )}
                {opt}
              </button>
            );
          })}
        </div>
        {/* Conditional follow-up text field */}
        {followUpConfig && triggerActive && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">{followUpConfig.label}</label>
            <textarea
              rows={3}
              value={followUpText}
              onChange={e => emitChange(selected, e.target.value)}
              className="input resize-none text-sm"
              placeholder="Please provide details…"
            />
          </div>
        )}
        {errMsg}
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <div>
        {base}
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
          placeholder="Enter number"
          inputMode="decimal"
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "date") {
    return (
      <div>
        {base}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "datetime") {
    return (
      <div>
        {base}
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "photo") {
    const hasPhoto = value && value.startsWith("http");
    return (
      <div>
        {base}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Store as base64 temporarily; the submit handler will upload to Supabase
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm transition ${
            hasPhoto
              ? "border-green-400 bg-green-50 text-green-700"
              : error
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-gray-300 bg-white text-gray-500 hover:border-brand hover:text-brand"
          }`}
        >
          {value && !value.startsWith("http") ? (
            <>
              {/* preview */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Preview" className="h-32 w-full rounded-lg object-cover" />
              <span className="text-xs font-medium text-green-700">Photo captured — tap to retake</span>
            </>
          ) : hasPhoto ? (
            <span className="font-medium">Photo uploaded ✓</span>
          ) : (
            <>
              <CameraIcon />
              <span className="font-medium">Take photo or upload</span>
            </>
          )}
        </button>
        {errMsg}
      </div>
    );
  }

  if (question.type === "multi_number") {
    const count = parseInt(question.options?.[0] ?? "3");
    let vals: string[];
    try {
      vals = value ? JSON.parse(value) : Array(count).fill("");
    } catch { vals = Array(count).fill(""); }
    if (vals.length !== count) {
      vals = Array.from({ length: count }, (_, i) => vals[i] ?? "");
    }

    const updateVal = (idx: number, v: string) => {
      const next = [...vals];
      next[idx] = v;
      onChange(JSON.stringify(next));
    };

    const filled = vals.filter(v => v !== "" && !isNaN(Number(v)));
    const nums = filled.map(Number);
    const min = nums.length ? Math.min(...nums) : null;

    return (
      <div className="space-y-1">
        <label className="label">
          {question.label}
          {question.required && <span className="ml-1 text-brand">*</span>}
        </label>
        {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-2">{question.hint}</p>}
        <div className={`grid gap-2 ${error ? "rounded-xl border border-red-300 p-2" : ""}`}
          style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
          {vals.map((v, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-xs text-gray-400 text-center">{i + 1}</p>
              <input
                type="number"
                value={v}
                onChange={e => updateVal(i, e.target.value)}
                className="input text-sm py-1.5 text-center w-full"
                placeholder="—"
                inputMode="decimal"
                step="0.1"
              />
            </div>
          ))}
        </div>
        {min !== null && (
          <p className="text-xs text-gray-500 pt-0.5">
            Min: <span className="font-semibold text-gray-700">{min}</span>
            {" · "}Avg: <span className="font-semibold text-gray-700">{(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)}</span>
          </p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (question.type === "ingredient_table") {
    type LotUse = { lot_id: string; julian_code: string; weight_g: string };
    type IngRow = { name: string; lots: LotUse[] };

    const ingredients = (question.options ?? []).map((opt) => {
      const [name, weight] = (opt as string).split("|");
      return { name: name ?? opt, intended: Number(weight ?? 0) };
    });

    let rows: IngRow[];
    try {
      const parsed = value ? JSON.parse(value) : [];
      // Three supported formats:
      // 1. Old plain array of rows
      // 2. New { batches, rows } object (persists multiplier state with the draft)
      // 3. Very old rows with batch_code/actual_weight fields
      const rawRows: (IngRow & { batch_code?: string; actual_weight?: string })[] =
        Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
      rows = rawRows.map((r, i) => ({
        name: r.name ?? ingredients[i]?.name ?? "",
        lots: r.lots ?? [{ lot_id: "", julian_code: r.batch_code ?? "", weight_g: r.actual_weight ?? "" }],
      }));
    } catch { rows = []; }

    if (rows.length !== ingredients.length) {
      rows = ingredients.map((ing, i) => ({
        name: ing.name,
        lots: rows[i]?.lots ?? [{ lot_id: "", julian_code: todayJulianCode(), weight_g: "" }],
      }));
    }

    const emptyLot: LotUse = { lot_id: "", julian_code: todayJulianCode(), weight_g: "" };

    // Emit the combined {batches, rows} value so both are persisted in the draft
    const emitIngredientValue = (newBatches: typeof batches, newRows: IngRow[]) =>
      onChange(JSON.stringify({ batches: newBatches, rows: newRows }));
    const update = (newRows: IngRow[]) => emitIngredientValue(batches, newRows);
    // Update batch multipliers AND emit so the draft captures the new setting immediately
    const updateBatches = (newBatches: typeof batches) => {
      setBatches(newBatches);
      emitIngredientValue(newBatches, rows);
    };

    const updateLot = (ingIdx: number, lotIdx: number, field: keyof LotUse, val: string) => {
      const newRows = rows.map((row, i) => {
        if (i !== ingIdx) return row;
        const newLots = row.lots.map((lot, j) => {
          if (j !== lotIdx) return lot;
          const updated = { ...lot, [field]: val };
          if (field === "lot_id") {
            const lots = findLots(ingredientLots ?? {}, ingredients[ingIdx].name);
            const lot = lots.find(l => l.id === val);
            if (lot) updated.julian_code = lot.julian_code;
          }
          return updated;
        });
        return { ...row, lots: newLots };
      });
      update(newRows);
    };

    const addLot = (ingIdx: number) => {
      const newRows = rows.map((row, i) =>
        i === ingIdx ? { ...row, lots: [...row.lots, emptyLot] } : row
      );
      update(newRows);
    };

    const removeLot = (ingIdx: number, lotIdx: number) => {
      const newRows = rows.map((row, i) => {
        if (i !== ingIdx) return row;
        const newLots = row.lots.filter((_, j) => j !== lotIdx);
        return { ...row, lots: newLots.length ? newLots : [emptyLot] };
      });
      update(newRows);
    };

    return (
      <div>
        <label className="label">
          {question.label}
          {question.required && <span className="ml-1 text-brand">*</span>}
        </label>
        {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-2">{question.hint}</p>}

        {/* ── Batches ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 mb-2 space-y-2">
          {batches.map((batch, bIdx) => (
            <div key={bIdx} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-600 shrink-0 w-14">
                {batches.length > 1 ? `Batch ${bIdx + 1}` : "Batch"}
              </span>
              <div className="flex items-center gap-1 flex-wrap flex-1">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateBatches(batches.map((b, i) =>
                      i === bIdx ? { multiplier: p, input: String(p) } : b
                    ))}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                      batch.multiplier === p
                        ? "bg-brown text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-brown/40"
                    }`}
                  >
                    {p}×
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={batch.input}
                    onChange={(e) => setBatches(prev => prev.map((b, i) =>
                      i === bIdx ? { ...b, input: e.target.value } : b
                    ))}
                    onBlur={() => {
                      const v = parseFloat(batch.input);
                      if (!isNaN(v) && v > 0) {
                        updateBatches(batches.map((b, i) =>
                          i === bIdx ? { multiplier: v, input: String(v) } : b
                        ));
                      } else {
                        // Invalid input — reset display only, no emit
                        setBatches(batches.map((b, i) =>
                          i === bIdx ? { ...b, input: String(b.multiplier) } : b
                        ));
                      }
                    }}
                    className="input w-16 text-xs py-1 text-center"
                    placeholder="e.g. 0.65"
                  />
                  <span className="text-xs text-gray-500">×</span>
                </div>
              </div>
              {batches.length > 1 && (
                <button
                  type="button"
                  onClick={() => updateBatches(batches.filter((_, i) => i !== bIdx))}
                  className="text-gray-300 hover:text-red-400 transition text-lg leading-none shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateBatches([...batches, { multiplier: 1, input: "1" }])}
            className="text-xs text-brand hover:text-brown hover:underline"
          >
            + Add another batch
          </button>
          {batches.length > 1 && (
            <p className="text-xs text-amber-700 font-medium">
              {batches.length} batches — combined total: {totalMultiplier}× recipe
            </p>
          )}
          {batches.length === 1 && totalMultiplier !== 1 && (
            <p className="text-xs text-amber-700 font-medium">
              Targets scaled to {totalMultiplier}×
            </p>
          )}
        </div>

        <div className={`space-y-2 ${error ? "rounded-xl border border-red-300 p-2" : ""}`}>
          {ingredients.map((ing, ingIdx) => {
            const row = rows[ingIdx];
            const availableLots = findLots(ingredientLots ?? {}, ing.name);
            const density = findDensity(densityByName ?? {}, ing.name);
            const totalEntered = (row?.lots ?? []).reduce((sum, l) => sum + (Number(l.weight_g) || 0), 0);
            const scaledTarget = Math.round(ing.intended * totalMultiplier);
            const diff = totalEntered - scaledTarget;
            const targetLabel = density
              ? `${scaledTarget.toLocaleString()}g (${(scaledTarget / density).toFixed(2)}L)`
              : `${scaledTarget.toLocaleString()}g`;
            return (
              <div key={ing.name} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{ing.name}</p>
                  <span className="text-xs text-gray-500 tabular-nums">Target: {targetLabel}</span>
                </div>
                {(row?.lots ?? [emptyLot]).map((lotUse, lotIdx) => (
                  <div key={lotIdx} className="flex gap-2 items-center">
                    {availableLots.length > 0 ? (
                      <select
                        value={lotUse.lot_id}
                        onChange={(e) => updateLot(ingIdx, lotIdx, "lot_id", e.target.value)}
                        className="input flex-1 text-sm py-1.5 min-w-0"
                      >
                        <option value="">Select Julian code…</option>
                        {availableLots.map((l) => {
                          // Subtract weight already committed to this lot in OTHER rows of the
                          // same ingredient so the displayed availability stays accurate as the
                          // user fills in the form — without waiting for a DB round-trip.
                          const usedInOtherRows = (row?.lots ?? []).reduce((sum, r, j) => {
                            if (j === lotIdx) return sum;
                            return r.lot_id === l.id ? sum + (Number(r.weight_g) || 0) : sum;
                          }, 0);
                          const effectiveQty = Math.max(0, l.quantity_remaining_g - usedInOtherRows);
                          return (
                            <option key={l.id} value={l.id}>
                              {l.julian_code} — {effectiveQty.toLocaleString()}g left
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="relative">
                          <input
                            type="text"
                            value={lotUse.julian_code}
                            onChange={(e) => updateLot(ingIdx, lotIdx, "julian_code", e.target.value)}
                            className="input w-full text-sm py-1.5 font-mono"
                            placeholder="Julian code"
                          />
                          {lotUse.julian_code === todayJulianCode() && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brown bg-brand/40 rounded-full px-1.5 py-0.5 pointer-events-none">
                              today
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {density ? (
                      <>
                        {/* Litres input — enter L, g auto-updates */}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={litresDisplay[`${ingIdx}-${lotIdx}`] ?? (lotUse.weight_g ? (Number(lotUse.weight_g) / density).toFixed(2) : "")}
                          onChange={(e) => setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: e.target.value }))}
                          onBlur={(e) => {
                            const litres = parseFloat(e.target.value);
                            if (!isNaN(litres) && litres > 0) {
                              updateLot(ingIdx, lotIdx, "weight_g", String(Math.round(litres * density)));
                              setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: litres.toFixed(2) }));
                              setGramsDisplay(prev => { const n = { ...prev }; delete n[`${ingIdx}-${lotIdx}`]; return n; });
                            } else {
                              updateLot(ingIdx, lotIdx, "weight_g", "");
                              setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: "" }));
                              setGramsDisplay(prev => { const n = { ...prev }; delete n[`${ingIdx}-${lotIdx}`]; return n; });
                            }
                          }}
                          className="input w-24 shrink-0 text-sm py-1.5"
                          placeholder="Litres"
                        />
                        {/* Grams input — enter g, L auto-updates */}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={gramsDisplay[`${ingIdx}-${lotIdx}`] ?? (lotUse.weight_g ? lotUse.weight_g : "")}
                          onChange={(e) => setGramsDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: e.target.value }))}
                          onBlur={(e) => {
                            const grams = parseFloat(e.target.value);
                            if (!isNaN(grams) && grams > 0) {
                              updateLot(ingIdx, lotIdx, "weight_g", String(Math.round(grams)));
                              setGramsDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: String(Math.round(grams)) }));
                              setLitresDisplay(prev => { const n = { ...prev }; delete n[`${ingIdx}-${lotIdx}`]; return n; });
                            } else {
                              updateLot(ingIdx, lotIdx, "weight_g", "");
                              setGramsDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: "" }));
                              setLitresDisplay(prev => { const n = { ...prev }; delete n[`${ingIdx}-${lotIdx}`]; return n; });
                            }
                          }}
                          className="input w-24 shrink-0 text-sm py-1.5"
                          placeholder="Grams"
                        />
                      </>
                    ) : (
                      <input
                        type="number"
                        value={lotUse.weight_g}
                        onChange={(e) => updateLot(ingIdx, lotIdx, "weight_g", e.target.value)}
                        className="input w-28 shrink-0 text-sm py-1.5"
                        placeholder="Weight (g)"
                        inputMode="decimal"
                        step="0.1"
                      />
                    )}
                    {(row?.lots.length ?? 1) > 1 && (
                      <button type="button" onClick={() => removeLot(ingIdx, lotIdx)}
                        className="text-lg text-gray-300 hover:text-red-400 transition leading-none shrink-0">×</button>
                    )}
                  </div>
                ))}
                <div className="flex items-start justify-between pt-1">
                  <button type="button" onClick={() => addLot(ingIdx)}
                    className="text-xs text-brand hover:underline mt-0.5">
                    + Split across another lot
                  </button>
                  {totalEntered > 0 && (
                    <div className="text-xs tabular-nums text-right space-y-0.5">
                      {Math.abs(diff) <= scaledTarget * 0.005 ? (
                        <p className="font-semibold text-green-600">
                          {density
                            ? `${(totalEntered / density).toFixed(2)}L (${totalEntered.toLocaleString()}g) ✓`
                            : `${totalEntered.toLocaleString()}g ✓`}
                        </p>
                      ) : (
                        <>
                          <p className="text-gray-500">
                            Subtotal:{" "}
                            {density
                              ? `${(totalEntered / density).toFixed(2)}L (${totalEntered.toLocaleString()}g)`
                              : `${totalEntered.toLocaleString()}g`}
                          </p>
                          {diff < 0 ? (
                            <p className="font-medium text-amber-600">
                              Remaining:{" "}
                              {density
                                ? `${(Math.abs(diff) / density).toFixed(2)}L (${Math.abs(diff).toLocaleString()}g)`
                                : `${Math.abs(diff).toLocaleString()}g`}
                            </p>
                          ) : (
                            <p className="font-medium text-red-500">
                              Over by:{" "}
                              {density
                                ? `${(diff / density).toFixed(2)}L (${diff.toLocaleString()}g)`
                                : `${diff.toLocaleString()}g`}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {errMsg}
      </div>
    );
  }

  if (question.type === "packing_runs") {
    // Read custom packaging labels + optional display hint from hint field.
    // Stored as JSON: {"unit":"jar","closure":"lid","hint":"optional display text"}
    // Falls back to plain-text hint for older records.
    let packUnit = "jar";
    let packClosure = "lid";
    let packDisplayHint: string | null = question.hint; // default: show as-is (plain text)
    // When the container/closure is linked to a primary packaging item, the batch
    // field becomes a lot picker (from stock) and the count is deducted on submit.
    let jarIngredient = "";
    let closureIngredient = "";
    try {
      const hintData = question.hint ? JSON.parse(question.hint) : null;
      if (hintData && typeof hintData === "object") {
        if (hintData.unit) packUnit = hintData.unit;
        if (hintData.closure) packClosure = hintData.closure;
        if (hintData.jar_ingredient) jarIngredient = hintData.jar_ingredient;
        if (hintData.closure_ingredient) closureIngredient = hintData.closure_ingredient;
        packDisplayHint = hintData.hint ?? null; // only show if explicitly set
      }
    } catch { /* plain-text hint, use as-is */ }

    const jarLots = jarIngredient ? (ingredientLots?.[jarIngredient] ?? []) : [];
    const closureLots = closureIngredient ? (ingredientLots?.[closureIngredient] ?? []) : [];

    // Simple pluralisation — don't add "s" if word already ends in "s"
    const pluralise = (w: string) => (w.toLowerCase().endsWith("s") ? w : w + "s");
    const unitCap = packUnit.charAt(0).toUpperCase() + packUnit.slice(1);
    const closureCap = packClosure.charAt(0).toUpperCase() + packClosure.slice(1);

    type PackRun = {
      pack_weight: string;
      jars_used: string;
      jar_batch: string;
      jar_lot_id?: string;
      lids_count: string;
      lids_batch: string;
      lids_lot_id?: string;
      packed_by: string;
    };
    const emptyRun: PackRun = { pack_weight: "", jars_used: "", jar_batch: "", jar_lot_id: "", lids_count: "", lids_batch: "", lids_lot_id: "", packed_by: "" };
    let runs: PackRun[];
    try {
      runs = value ? JSON.parse(value) : [emptyRun];
    } catch {
      runs = [emptyRun];
    }
    if (runs.length === 0) runs = [emptyRun];
    const updateRun = (idx: number, field: keyof PackRun, val: string) => {
      const next = runs.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      onChange(JSON.stringify(next));
    };
    const updateRunFields = (idx: number, patch: Partial<PackRun>) => {
      const next = runs.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      onChange(JSON.stringify(next));
    };
    const addRun = () => onChange(JSON.stringify([...runs, emptyRun]));
    const removeRun = (idx: number) => {
      if (runs.length === 1) return;
      onChange(JSON.stringify(runs.filter((_, i) => i !== idx)));
    };
    return (
      <div>
        {/* Render label manually so we don't show raw JSON hint */}
        <div className="space-y-1 mb-1">
          <label className="label">
            {question.label}
            {question.required && <span className="ml-1 text-brand">*</span>}
          </label>
          {packDisplayHint && <p className="text-xs text-gray-500 -mt-0.5 mb-1">{packDisplayHint}</p>}
        </div>
        <div className="space-y-3">
          {runs.map((run, idx) => (
            <div key={idx} className={`rounded-xl border p-3 space-y-2 ${error ? "border-red-300" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Run {idx + 1}</p>
                {runs.length > 1 && (
                  <button type="button" onClick={() => removeRun(idx)} className="text-xs text-gray-400 hover:text-red-500 transition">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Pack weight (g)</label>
                  <input type="number" inputMode="numeric" value={run.pack_weight} onChange={(e) => updateRun(idx, "pack_weight", e.target.value)} className="input text-sm py-1.5" placeholder="227" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">No. of {pluralise(packUnit)}</label>
                  <input type="number" inputMode="numeric" value={run.jars_used} onChange={(e) => updateRun(idx, "jars_used", e.target.value)} className="input text-sm py-1.5" placeholder="0" />
                </div>

                {/* Container batch — lot picker (deducts stock) when linked, else free text */}
                {jarIngredient ? (
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">{unitCap} batch (from stock)</label>
                    <select
                      value={run.jar_lot_id || ""}
                      onChange={(e) => {
                        const lot = jarLots.find((l) => l.id === e.target.value);
                        updateRunFields(idx, { jar_lot_id: e.target.value, jar_batch: lot?.julian_code ?? "" });
                      }}
                      className="input text-sm py-1.5"
                    >
                      <option value="">— Select batch —</option>
                      {jarLots.map((l) => (
                        <option key={l.id} value={l.id}>{l.julian_code} — {l.quantity_remaining_g.toLocaleString()} left</option>
                      ))}
                      {run.jar_lot_id && !jarLots.some((l) => l.id === run.jar_lot_id) && (
                        <option value={run.jar_lot_id}>{run.jar_batch || "Selected batch"}</option>
                      )}
                    </select>
                    {jarLots.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-0.5">No {jarIngredient} in stock — log a delivery in Goods In.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">{unitCap} batch no.</label>
                    <input type="text" value={run.jar_batch} onChange={(e) => updateRun(idx, "jar_batch", e.target.value)} className="input text-sm py-1.5" placeholder="JB001" />
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">No. of {pluralise(packClosure)}</label>
                  <input type="number" inputMode="numeric" value={run.lids_count} onChange={(e) => updateRun(idx, "lids_count", e.target.value)} className="input text-sm py-1.5" placeholder="0" />
                </div>

                {/* Closure batch — lot picker (deducts stock) when linked, else free text */}
                {closureIngredient ? (
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">{closureCap} batch (from stock)</label>
                    <select
                      value={run.lids_lot_id || ""}
                      onChange={(e) => {
                        const lot = closureLots.find((l) => l.id === e.target.value);
                        updateRunFields(idx, { lids_lot_id: e.target.value, lids_batch: lot?.julian_code ?? "" });
                      }}
                      className="input text-sm py-1.5"
                    >
                      <option value="">— Select batch —</option>
                      {closureLots.map((l) => (
                        <option key={l.id} value={l.id}>{l.julian_code} — {l.quantity_remaining_g.toLocaleString()} left</option>
                      ))}
                      {run.lids_lot_id && !closureLots.some((l) => l.id === run.lids_lot_id) && (
                        <option value={run.lids_lot_id}>{run.lids_batch || "Selected batch"}</option>
                      )}
                    </select>
                    {closureLots.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-0.5">No {closureIngredient} in stock — log a delivery in Goods In.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">{closureCap} batch no.</label>
                    <input type="text" value={run.lids_batch} onChange={(e) => updateRun(idx, "lids_batch", e.target.value)} className="input text-sm py-1.5" placeholder="LB001" />
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Packed by (initials)</label>
                  <input type="text" value={run.packed_by} onChange={(e) => updateRun(idx, "packed_by", e.target.value)} className="input text-sm py-1.5" placeholder="SS" />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addRun}
            className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand transition"
          >
            + Add another packing run
          </button>
        </div>
        {errMsg}
      </div>
    );
  }

  if (question.type === "batch_link") {
    let selectedId = "";
    try { const p = value ? JSON.parse(value) : null; selectedId = p?.submission_id ?? ""; } catch { /* legacy/plain */ }
    return (
      <div>
        {base}
        <select
          className="input w-full"
          value={selectedId}
          onChange={(e) => {
            const opt = batchLinkOptions.find(o => o.id === e.target.value);
            onChange(opt ? JSON.stringify({ submission_id: opt.id, batch_code: opt.code, product: opt.product }) : "");
          }}
        >
          <option value="">— Not linked —</option>
          {batchLinkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          {/* Keep a previously-linked record selectable even if it's beyond the recent list */}
          {selectedId && !batchLinkOptions.some(o => o.id === selectedId) && (() => {
            let lbl = "Linked batch record";
            try { const p = JSON.parse(value); lbl = `${p.product ?? ""} — ${p.batch_code || "no batch code"}`.trim(); } catch { /* ignore */ }
            return <option value={selectedId}>{lbl}</option>;
          })()}
        </select>
        {batchLinkOptions.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">No production batch records found yet.</p>
        )}
        {errMsg}
      </div>
    );
  }

  if (question.type === "document") {
    const pdfUrl = question.document_path
      ? supabase.storage.from("compliance-docs").getPublicUrl(question.document_path).data.publicUrl
      : null;
    const fileName = question.document_path?.split("/").pop()?.replace(/^\d+_/, "") ?? "Document";
    const acknowledged = value === "true";

    return (
      <div>
        <div className={`rounded-xl border p-4 space-y-3 ${error ? "border-red-300 bg-red-50" : "border-brand/30 bg-brand/5"}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/20">
              <svg className="h-5 w-5 text-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{question.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{fileName}</p>
            </div>
          </div>
          {pdfUrl && (
            <button
              type="button"
              onClick={() => setPdfOpen(true)}
              className="w-full rounded-lg bg-brown text-white text-sm font-medium py-2.5 hover:bg-brown/90 transition"
            >
              View Document
            </button>
          )}
          {question.document_required && (
            <button
              type="button"
              onClick={() => onChange(acknowledged ? "false" : "true")}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                acknowledged
                  ? "border-green-300 bg-green-50"
                  : error
                  ? "border-red-300 bg-white"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${acknowledged ? "border-green-500 bg-green-500 text-white" : "border-gray-300"}`}>
                {acknowledged && (
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-sm font-medium text-gray-800">
                I have read this document
                <span className="ml-1 text-brand text-xs">*</span>
              </span>
            </button>
          )}
        </div>
        {errMsg}

        {pdfOpen && pdfUrl && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
              <p className="text-sm font-medium text-white truncate">{fileName}</p>
              <button
                type="button"
                onClick={() => setPdfOpen(false)}
                className="ml-4 shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 transition"
              >
                Close
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 w-full border-0"
              title={fileName}
            />
          </div>
        )}
      </div>
    );
  }

  if (question.type === "signature") {
    return <SignatureField question={question} value={value} onChange={onChange} error={error} />;
  }

  // Default: text
  return (
    <div>
      {base}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={question.label.length > 60 ? 3 : 2}
        className={`input resize-none ${error ? "border-red-300" : ""}`}
        placeholder="Enter text…"
      />
      {errMsg}
    </div>
  );
}

function SignatureField({ question, value, onChange, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = useCallback(() => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    onChange(data);
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div>
      <label className="label">
        {question.label}
        {question.required && <span className="ml-1 text-brand">*</span>}
      </label>
      {question.hint && <p className="text-xs text-gray-500 mb-1">{question.hint}</p>}
      <div className={`rounded-xl border-2 overflow-hidden ${error ? "border-red-300" : value ? "border-brand/40" : "border-gray-200"}`}>
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full touch-none bg-white cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5">
          <span className="text-xs text-gray-400">Sign above</span>
          <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-red-600 transition">
            Clear
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
